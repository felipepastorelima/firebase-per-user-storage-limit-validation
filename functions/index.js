const functions = require('firebase-functions');
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
const cors = require('cors')({
  origin: true
});

/*
* Initialization via service-account is needed because the method
* `admin.auth().verifyIdToken()` demands it
*/
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`
});

const storage = require('@google-cloud/storage')({
  projectId: process.env.GCLOUD_PROJECT,
  credentials: serviceAccount
});

const storageBucket = `${process.env.GCLOUD_PROJECT}.appspot.com`;

/*
* Generates a upload token with the storage left information
* that will be used to evaluate if the file sent doesn't exceed the quota
*/
exports.uploadToken = functions.https.onRequest((request, response) => {
    cors(request, response, () => {
      Authentication.extractUidFromToken(request.query.token).then((uid) => {
        return Storage.storageLeftInBytes(uid).then(storageLeftInBytes => {
          const metadata = {
            storageLeftInBytes: Number(storageLeftInBytes),
            path: request.query.path
          };

          return admin.auth().createCustomToken(uid, metadata).then((token) => {
            response.send({ token });
          });
        });
      }).catch(function (error) {
        console.error(error);
        response.send(403);
      });
    });
});

/*
* Return the user's storage left in bytes
*/
exports.storageLeftInBytes = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    Authentication.extractUidFromToken(request.query.token).then((uid) => {
      return Storage.storageLeftInBytes(uid).then(storageLeftInBytes => {
        response.send({ storageLeftInBytes });
      });
    }).catch(function (error) {
      console.error(error);
      response.send(403);
    });
  });
});

/*
* Delete all user's files
*/
exports.deleteAllFiles = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    Authentication.extractUidFromToken(request.query.token).then((uid) => {
      return Storage.deleteAllFiles(uid).then(() => response.send(200));
    }).catch(function (error) {
      console.error(error);
      response.send(403);
    });
  });
});

class Authentication {
  static extractUidFromToken(token) {
    return admin.auth().verifyIdToken(token).then((decodedToken) => {
      return decodedToken.uid;
    });
  }
}

class Profile {
  static get none() {
    return 'none';
  }

  static get free() {
    return 'free';
  }

  static get premium() {
    return 'premium';
  }

  static of (uid) {
    return admin.database().ref(`users-profiles/${uid}`).once('value').then(snapshot => {
      return snapshot.val() || this.none;
    })
  }
}

class Storage {
  static storageLeftInBytes(uid) {
    return Profile.of(uid).then(profile => {
      return Storage.storageInBytes(uid).then(storageInBytes => {
        const storageLimitInBytes = Storage.storageLimitInBytes(profile);
        return storageLimitInBytes - storageInBytes;
      })
    });
  }

  static storageInBytes(uid) {
    return new Promise((resolve, reject) => {
      storage.bucket(storageBucket).getFiles(
        { query: { prefix: uid } },
        (err, files) => {
          if (err) {
            reject(err);
            return;
          }

          if (!files || !files.length) {
            resolve(0);
            return;
          }

          resolve(
            files
              .map(file => Number(file.metadata.size))
              .reduce((a, b) => a + b, 0)
          );
        }
      );
    });
  }

  static storageLimitInBytes(profile) {
    switch (profile) {
      case Profile.free: {
        return 100000;
      }
      case Profile.premium: {
        return 500000;
      }
      default: {
        return 0;
      }
    }
  }

  static deleteAllFiles(uid) {
    return new Promise((resolve, reject) => {
      storage.bucket(storageBucket).getFiles(
        { query: { prefix: uid } },
        (err, files) => {
          if (err) {
            reject(err);
            return;
          }

          if (!files || !files.length) {
            resolve();
            return;
          }

          Promise.all(
            files.map(file => file.delete())
          )
            .then(() => {
              resolve();
            })
            .catch((error) => {
              console.error(error);
              reject(error);
            });
        }
      );
    });
  }
}
