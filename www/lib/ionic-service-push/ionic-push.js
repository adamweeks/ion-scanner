angular.module('ionic.service.push', ['ngCordova', 'ngWebSocket', 'ionic.service.core'])

/**
 * The Ionic Push service client wrapper.
 *
 * Example:
 *
 * angular.controller(['$scope', '$ionicPush', function($scope, $ionicPush) {
 * }])
 *
 */
.factory('$ionicPush', ['$http', '$cordovaPush','$cordovaLocalNotification', '$ionicApp', '$ionicPushActions', '$ionicUser', '$rootScope', '$log', '$q', '$websocket',

function($http, $cordovaPush, $cordovaLocalNotification, $ionicApp, $ionicPushActions, $ionicUser, $rootScope, $log, $q, $websocket) {

  // Grab the current app
  var app = $ionicApp.getApp();

  //Check for required credentials
  if(!app || !app.app_id) {
    console.error('PUSH: Unable to initialize, you must call $ionicAppProvider.identify() first');
  }

  function generateDevGuid() {
    // Some crazy bit-twiddling to generate a random guid
    return 'DEV-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

  function init(options) {
    var defer = $q.defer();

    // TODO: This should be part of a config not a direct method
    var gcmKey = $ionicApp.getGcmId();
    var api = $ionicApp.getValue('push_api_server');

    //Default configuration
    var config = {
      "senderID": gcmKey,
      "badge": true,
      "sound": true,
      "alert": true
    };

    if (app.dev_push) {
      var localNotifications = false;
      if (window.cordova && window.cordova.plugins && window.cordova.plugins.notification && window.cordova.plugins.notification.local) {
        localNotifications = true;
      }
      var devToken = generateDevGuid();
      var socketHost = api.replace(/^http/, 'ws');
      var dataStream = $websocket(socketHost);

      // Identify yourself
      dataStream.send({id: devToken});

      // Keep connection alive (Heroku)
      setInterval(function(){
        dataStream.send({ping: "Hello"});
      }, 10000);

      // Handle incoming DEV pushes
      dataStream.onMessage(function(message) {
        if (localNotifications) {
          console.log('$ionicPush: Received dev ' + message.data);
          window.cordova.plugins.notification.local.registerPermission(function (granted) {
            if (granted) {
              window.cordova.plugins.notification.local.schedule({
                title: 'DEVELOPMENT PUSH',
                text: message.data
              });
            }
          });
        } else {
          console.log('$ionicPush: No device, sending alert instead.');
          alert(message.data);
        }
      });

      console.log('$ionicPush:REGISTERED_DEV_MODE', devToken);
      $rootScope.$emit('$cordovaPush:tokenReceived', {
        token: devToken,
        platform: 'none'
      });
      defer.resolve(devToken);

    } else {
      $cordovaPush.register(config).then(function(token) {
        console.log('$ionicPush:REGISTERED', token);

        defer.resolve(token);

        if(token !== 'OK') {

          $rootScope.$emit('$cordovaPush:tokenReceived', {
            token: token,
            platform: 'ios'
          });

          // Push the token into the user data
          try {
            $ionicUser.push('_push.ios_tokens', token, true);
          } catch(e) {
            console.warn('Received push token before user was identified and will not be synced with ionic.io. Make sure to call $ionicUser.identify() before calling $ionicPush.register.');
          }
        }
      }, function(err) {
        console.error('$ionicPush:REGISTER_ERROR', err);
      });
    }

    $rootScope.$on('$cordovaPush:notificationReceived', function(event, notification) {
      console.log('$ionicPush:RECEIVED', JSON.stringify(notification));

      var callbackRet = options.onNotification && options.onNotification(notification);

      // If the custom handler returns false, don't handle this at all in
      // our code
      if(callbackRet === false) {
        return;
      }

      if (ionic.Platform.isAndroid() && notification.event == "registered") {
        /**
         * Android handles push notification registration in a callback from the GCM service (whereas
         * iOS can be handled in a single call), so we need to check for a special notification type
         * here.
         */
        console.log('$ionicPush:REGISTERED', notification.regid);
        $rootScope.$emit('$cordovaPush:tokenReceived', {
          token: notification.regid,
          platform: 'android'
        });
        androidInit(notification.regid);
      }

      // If we have the notification plugin, show this
      if(options.canShowAlert && notification.alert) {
        if (navigator.notification) {
          navigator.notification.alert(notification.alert);
        } else {
          // Browser version
          alert(notification.alert);
        }
      }

      if(options.canPlaySound) {
        if (notification.sound && window.Media) {
          var snd = new Media(notification.sound);
          snd.play();
        }
      }

      if(options.canSetBadge) {
        if (notification.badge) {
          $cordovaPush.setBadgeNumber(notification.badge).then(function(result) {
            // Success!
          }, function(err) {
            console.log('Could not set badge!', err);
            // An error occurred. Show a message to the user
          });
        }
      }

      // Run any custom notification actions
      if(options.canRunActionsOnWake) {
        if(notification.foreground == "0" || notification.foreground === false) {
          $ionicPushActions.run(notification);
        }
      }
    });


    return defer.promise;
  }

  function androidInit(token) {
    // Push the token into the user data
    try {
      $ionicUser.push('_push.android_tokens', token, true);
    } catch(e) {
      console.warn('Received push token before user was identified and will not be synced with ionic.io. Make sure to call $ionicUser.identify() before calling $ionicPush.register.');
    }
  }

  return {
    /**
     * Register for push notifications.
     *
     * Configure the default notification behavior by using the options param:
     *
     * {
     *   // Whether to allow notifications to pop up an alert while in the app.
     *   // Setting this to false lets you control the push behavior more closely.
     *   allowAlert: true/false (default: true)
     *
     *   // Whether to allow notifications to update the badge
     *   allowBadge: true/false (default: true)
     *
     *   // Whether to allow notifications to play a sound
     *   allowSound: true/false (default: true)
     *
     *   // Whether to run auto actions, like navigating to a state, when a push
     *   // is opened outside of the app (foreground is false)
     *   canRunActionsOnWake: true/false (default: true)
     *
     *   // A callback to do some custom task on notification
     *   onNotification: true/false (default: true)
     * }
     */
    register: function(options, userdata){
      return $q(function(resolve) {
        if (!app) {
          return;
        }

        options = angular.extend({
          canShowAlert: true,
          canSetBadge: true,
          canPlaySound: true,
          canRunActionsOnWake: true,
          onNotification: function () {
            return true;
          },
          onTokenRecieved: function (token) { }
        }, options);

        if (userdata) {
          var user = $ionicUser.get();
          if (!userdata.user_id || !user.user_id) {
            // Set your user_id here, or generate a random one
            console.warn("No user ID specified in userdata or existing model, generating generic user ID.");
            user.user_id = $ionicUser.generateGUID();
          };

          angular.extend(user, userdata);

          console.log('Identifying user.')
          $ionicUser.identify(user).then(function () {
            resolve(init(options));
          });
          }
        else {
          resolve(init(options));
        }
      });
    },
    unregister: function(options) {
      return $cordovaPush.unregister(options);
    }
  }
}])

.factory('$ionicPushActions', [
    '$rootElement',
    '$injector',
function($rootElement, $injector) {
  return {
    run: function(notification) {
      if(notification.$state) {
        // Auto navigate to state

        var injector = $rootElement.injector();
        if(injector.has('$state')) {
          $state = injector.get('$state');
          var p = {};
          try {
            p = JSON.parse(notification.$stateParams);
          } catch(e) {
          }
          $state.go(notification.$state, p);
        }
      }
    }
  }
}])
