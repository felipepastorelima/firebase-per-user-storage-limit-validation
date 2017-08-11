/*
* URL of firebase functions
*/
const functionsUrl = `https://us-central1-fir-per-user-storage.cloudfunctions.net`;

$(() => {
  Authentication.init();
  Profile.init();
  Uploader.init();
  Deleter.init();
});

/*
* Responsable for file deletion
*/
class Deleter {
  static init() {
    $("#delete-all-files-button").on('click', (event) => {
      this.deleteAllFilesAndRefreshPage();
    });
  }

  static deleteAllFilesAndRefreshPage() {
    Spinner.show();

    this
      .deleteAllFiles()
      .then(() => {
        return Storage.printStorageLeft().then(() => {
          Spinner.hide();
          $('#form-content').show();
        });
      })
      .catch(error => {
        console.error(error);
        Snackbar.error(error);
        Spinner.hide();
        $('#form-content').show();
      });
  }

  static deleteAllFiles() {
    return new Promise((resolve, reject) => {
      firebase.auth().currentUser.getToken(true)
        .then((idToken) => {
          const url = `${functionsUrl}/deleteAllFiles?token=${idToken}`;
          $.ajax({
            url,
            type: 'DELETE',
            success: function (result) {
              resolve();
            }
          });
        })
        .catch(error => reject(error));
    });
  }
}

/*
* Responsable for file upload
*/
class Uploader {
  static init() {
    $("input[type='file']").on('change', (event) => {
      const files = event.currentTarget.files;

      if (!files || !files.length) {
        return;
      }

      Uploader.reauthenticateWithTokenAndUpload(file[0]);
    });
  }

  static reauthenticateWithTokenAndUpload(file) {
    Spinner.show();

    this.reauthenticateWithToken()
      .then(() => {
        return this.upload(file).then(() => {
          return Storage.printStorageLeft().then(() => {
            $("input[type='file']").val(null);
            Spinner.hide();
            $('#form-content').show();
          });
        })
      })
      .catch(function (error) {
        $("input[type='file']").val(null);
        console.error(error);
        Snackbar.error(error);
        Spinner.hide();
        $('#form-content').show();
      });
  }

  /*
  * The simple token doesn't have the 'storageLeftInBytes' metadata
  * used to validate if the user has storage left to upload.
  * This method reauthenticate with this token.
  */
  static reauthenticateWithToken() {
    return firebase
      .auth()
      .currentUser
      .getToken(true)
      .then((idToken) => {
        const url = `${functionsUrl}/uploadToken?token=${idToken}`;
        return $.getJSON(url).then(response => {
          return firebase.auth().signInWithCustomToken(response.token);
        });
      });
  }

  static upload(file) {
    return new Promise((resolve, reject) => {
      let uploadTask = firebase
        .storage()
        .ref(`${Authentication.id}/${+new Date()}/${file.name}`)
        .put(file);

      uploadTask.on(firebase.storage.TaskEvent.STATE_CHANGED, () => {}, (error) => {
        reject(error);
      }, () => {
        resolve();
      });
    });
  }
}

/*
* Responsable for the user profile
*/
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

  static init() {
    $("#user-profile").on('change', () => {
      Profile.update();
    });
  }

  static update() {
    Spinner.show();

    return firebase
      .database()
      .ref(`users-profiles/${Authentication.id}`)
      .set(Profile.formValue())
      .then(snapshot => {
        return Storage.printStorageLeft().then(() => {
          Spinner.hide();
          $('#form-content').show();
        });
      })
      .catch(error => {
        Snackbar.error(error);
        Spinner.hide();
        $('#form-content').show();
      });
  }

  static formValue() {
    return $("#user-profile").val();
  }

  static loadFromDatabase() {
    return firebase
      .database()
      .ref(`users-profiles/${Authentication.id}`)
      .once('value')
      .then(snapshot => {
        $("#user-profile").val(
          snapshot.val() || this.none
        );
      });
  }
}

/*
* Responsable for user storage reading
*/
class Storage {
  static printStorageLeft() {
    return this
      .storageLeftInBytes()
      .then((storageLeftInBytes) => {
        $('#storage-left').text(storageLeftInBytes);
      });
  }

  static storageLeftInBytes() {
    return firebase.auth().currentUser.getToken(true).then(function (idToken) {
      const url = `https://us-central1-fir-per-user-storage.cloudfunctions.net/storageLeftInBytes?token=${idToken}`;
      return $.getJSON(url).then(response => {
        return Number(response.storageLeftInBytes);
      });
    });
  }
}

/*
 * Responsable for user authentication
 */
class Authentication {
  static init() {
    $('#login-button').on('click', () => {
      this.loginWithGoogleAndRefreshPage();
    });
  }

  static loginWithGoogleAndRefreshPage() {
    Spinner.show();

    Authentication
      .loginWithGoogle()
      .then(() => {
        return Promise.all([
          Storage.printStorageLeft(),
          Profile.loadFromDatabase(),
        ]).then(() => {
          Spinner.hide();
          $('#form-content').show();
        });
      })
      .catch((error) => {
        Snackbar.error(error.message);
        Spinner.hide();
        $('#login-content').show();
      });
  }

  static loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();

    return firebase
      .auth()
      .signInWithPopup(provider)
      .then((result) => {
        Authentication.id = result.user.uid;
      });
  }
}
Authentication.id = null;

/*
 * Responsable to show and hide the error snackbar
 */
class Snackbar {
  static error(message) {
    var data = {
      message,
      timeout: 2000,
    };

    $('#error')[0].MaterialSnackbar.showSnackbar(data);
  }
}

/*
 * Responsable to show and hide the spinner
 */
class Spinner {
  static show() {
    $('#login-content').hide();
    $('#form-content').hide();
    $('#spinner').show();
  }

  static hide() {
    $('#spinner').hide();
  }
}
