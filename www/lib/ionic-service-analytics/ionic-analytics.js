/*!
 * Ionic Analytics Client
 * Copyright 2014 Drifty Co. http://drifty.com/
 * See LICENSE in this repository for license information
 */
(function(){
var IonicServiceAnalyticsModule = angular.module('ionic.service.analytics', ['ionic.service.core']);

IonicServiceAnalyticsModule

/**
 * @private
 * When the app runs, add some heuristics to track for UI events.
 */
.run(['$ionicAnalytics', function($ionicAnalytics) {
  // Load events are how we track usage
  $ionicAnalytics.track('load', {});
}])


/**
 * @ngdoc service
 * @name $ionicAnalytics
 * @module ionic.services.analytics
 * @description
 *
 * A simple yet powerful analytics tracking system.
 *
 * The simple format is eventName, eventData. Both are arbitrary but the eventName
 * should be the same as previous events if you wish to query on them later.
 *
 * @usage
 * ```javascript
 * $ionicAnalytics.track('order', {
 *   price: 39.99,
 *   item: 'Time Machine',
 * });
 *
 * $ionicAnalytics.identify('favorite_things', {
 *   fruit: 'pear',
 *   animal: 'lion'
 * });
 * ```
 */
.provider('$ionicAnalytics', function() {
  var settings = {
    apiServer: 'https://analytics.ionic.io'
  };

  this.setApiServer = function(server) {
    settings.apiServer = server;
  };

  this.$get = ['$q', '$timeout', '$state', '$ionicApp', '$ionicUser', '$interval',
        '$http', 'domSerializer', 'persistentStorage',
        function($q, $timeout, $state, $ionicApp, $ionicUser, $interval,
          $http, domSerializer, persistentStorage) {

    // Configure api endpoint based on app id
    if (!apiEndpoint)
    var appId = $ionicApp.getApp().app_id,
        apiEndpoint = settings.apiServer
                    + '/api/v1/events/'
                    + appId,
        apiKey = $ionicApp.getApiWriteKey();

    var queueKey = 'ionic_analytics_event_queue_' + appId,
        dispatchKey = 'ionic_analytics_event_queue_dispatch_' + appId;

    var useEventCaching = true,
        dispatchInterval,
        dispatchIntervalTime;
    setDispatchInterval(30);
    $timeout(function() {
      dispatchQueue();
    });

    function connectedToNetwork() {
      // Can't access navigator stuff? Just assume connected.
      if (typeof navigator.connection === 'undefined' ||
          typeof navigator.connection.type === 'undefined' ||
          typeof Connection === 'undefined') {
        return true;
      }

      // Otherwise use the PhoneGap Connection plugin to determine the network state
      var networkState = navigator.connection.type;
      return networkState == Connection.ETHERNET ||
             networkState == Connection.WIFI ||
             networkState == Connection.CELL_2G ||
             networkState == Connection.CELL_3G ||
             networkState == Connection.CELL_4G ||
             networkState == Connection.CELL;
    }

    function dispatchQueue() {
      var eventQueue = persistentStorage.retrieveObject(queueKey) || {};
      if (Object.keys(eventQueue).length === 0) return;
      if (!connectedToNetwork()) return;

      console.log('dispatching queue', eventQueue);

      persistentStorage.lockedAsyncCall(dispatchKey, function() {

        // Send the analytics data to the proxy server
        return addEvents(eventQueue);
      }).then(function(data) {

        // Success from proxy server. Erase event queue.
        persistentStorage.storeObject(queueKey, {});

      }, function(err) {

        if (err === 'in_progress') {
        } else if (err === 'last_call_interrupted') {
          persistentStorage.storeObject(queueKey, {});
        } else {

          // If we didn't connect to the server at all -> keep events
          if (!err.status) {
            console.log('Error sending analytics data: Failed to connect to analytics server.');
          }

          // If we connected to the server but our events were rejected -> erase events
          else {
            console.log('Error sending analytics data: Server responded with error', eventQueue, {
              'status': err.status,
              'error': err.data
            });
            persistentStorage.storeObject(queueKey, {});
          }
        }
      });
    }

    function enqueueEvent(collectionName, eventData) {
      console.log('enqueueing event', collectionName, eventData);

      // Add timestamp property to the data
      if (!eventData.keen) {
        eventData.keen = {};
      }
      eventData.keen.timestamp = new Date().toISOString();

      // Add the data to the queue
      var eventQueue = persistentStorage.retrieveObject(queueKey) || {};
      if (!eventQueue[collectionName]) {
        eventQueue[collectionName] = [];
      }
      eventQueue[collectionName].push(eventData);

      // Write the queue to disk
      persistentStorage.storeObject(queueKey, eventQueue);
    }

    function setDispatchInterval(value) {
      // Set how often we should send batch events to Keen, in seconds.
      // Set this to a nonpositive number to disable event caching
      dispatchIntervalTime = value;

      // Clear the existing interval and set a new one.
      if (dispatchInterval) {
        $interval.cancel(dispatchInterval);
      }

      if (value > 0) {
        dispatchInterval = $interval(function() { dispatchQueue(); }, value * 1000);
        useEventCaching = true;
      } else {
        useEventCaching = false;
      }
    }

    function getDispatchInterval() {
      return dispatchIntervalTime;
    }

    function addEvent(collectionName, eventData) {
      var payload = {
        collectionName: [eventData]
      };
      return $http.post(apiEndpoint, payload, {
        headers: {
          "Authorization": apiKey,
          "Content-Type": "application/json"
        }
      });
    }

    function addEvents(events) {
      return $http.post(apiEndpoint, events, {
        headers: {
          "Authorization": apiKey,
          "Content-Type": "application/json"
        }
      });
    }

    return {
      setDispatchInterval: setDispatchInterval,
      getDispatchInterval: getDispatchInterval,
      track: function(eventName, data) {
        // Copy objects so they can sit in the queue without being modified
        var app = angular.copy($ionicApp.getApp()),
            user = angular.copy($ionicUser.get());

        if (!app.app_id) {
          var msg = 'You must provide an app_id to identify your app before tracking analytics data.\n    ' +
                    'See http://docs.ionic.io/services/getting-started/'
          throw new Error(msg)
        }
        if (!apiKey) {
          var msg = 'You must specify an api key before sending analytics data.\n    ' +
                    'See http://docs.ionic.io/services/getting-started/'
          throw new Error(msg)
        }

        // Don't expose api keys
        delete app.api_write_key;
        delete app.api_read_key;

        // Add user tracking data to everything sent to keen
        data._app = app;
        data._user = user;

        if (!data._ui) data._ui = {};
        data._ui.activeState = $state.current.name;

        if (useEventCaching) {
          enqueueEvent(eventName, data);
        } else {
          addEvent(eventName, data);
        }
      },
      identify: function(userData) {
        $ionicUser.identify(userData);
      }
    };
  }];
})


.factory('domSerializer', function() {
  var getElementTreeXPath = function(element) {
    // Calculate the XPath of a given element
    var paths = [];

    // Use nodeName (instead of localName) so namespace prefix is included (if any).
    for (; element && element.nodeType == 1; element = element.parentNode)
    {
      var index = 0;
      for (var sibling = element.previousSibling; sibling; sibling = sibling.previousSibling)
      {
        // Ignore document type declaration.
        if (sibling.nodeType == Node.DOCUMENT_TYPE_NODE)
          continue;

        if (sibling.nodeName == element.nodeName)
          ++index;
      }

      var tagName = element.nodeName.toLowerCase();
      var pathIndex = (index ? "[" + (index+1) + "]" : "");
      paths.splice(0, 0, tagName + pathIndex);
    }

    return paths.length ? "/" + paths.join("/") : null;
  }

  return {
    serializeElement: function(element) {
      // Code appropriated from open source project FireBug
      if (element && element.id)
        return '//*[@id="' + element.id + '"]';
      else
        return getElementTreeXPath(element);
    },

    deserializeElement: function(xpath, context) {
      var searchResult = document.evaluate(xpath, context || document);
      return searchResult.iterateNext();
    }
  }
})


/**
 * @private
 * Provides a safe interface to store objects in persistent memory
 */
.provider('persistentStorage', function() {
  return {
    $get: ['$q', '$window', function($q, $window) {
      var objectCache = {};
      var memoryLocks = {};

      var persistenceStrategy = {
        get: function(key) {
          return $window.localStorage.getItem(key);
        },
        remove: function(key) {
          return $window.localStorage.removeItem(key);
        },
        set: function(key, value) {
          return $window.localStorage.setItem(key, value);
        }
      };

      return {
        /**
         * Stores an object in local storage under the given key
        */
        storeObject: function(key, object) {

          // Convert object to JSON and store in localStorage
          var json = JSON.stringify(object);
          persistenceStrategy.set(key, json);

          // Then store it in the object cache
          objectCache[key] = object;
        },

        /**
         * Either retrieves the cached copy of an object,
         * or the object itself from localStorage.
         * Returns null if the object couldn't be found.
        */
        retrieveObject: function(key) {

          // First check to see if it's the object cache
          var cached = objectCache[key];
          if (cached) {
            return cached;
          }

          // Deserialize the object from JSON
          var json = persistenceStrategy.get(key);

          // null or undefined --> return null.
          if (json == null) {
            return null;
          }

          try {
            return JSON.parse(json);
          } catch (err) {
            return null;
          }
        },

        /**
         * Locks the async call represented by the given promise and lock key.
         * Only one asyncFunction given by the lockKey can be running at any time.
         *
         * @param lockKey should be a string representing the name of this async call.
         *        This is required for persistence.
         * @param asyncFunction Returns a promise of the async call.
         * @returns A new promise, identical to the one returned by asyncFunction,
         *          but with two new errors: 'in_progress', and 'last_call_interrupted'.
        */
        lockedAsyncCall: function(lockKey, asyncFunction) {

          var deferred = $q.defer();

          // If the memory lock is set, error out.
          if (memoryLocks[lockKey]) {
            deferred.reject('in_progress');
            return deferred.promise;
          }

          // If there is a stored lock but no memory lock, flag a persistence error
          if (persistenceStrategy.get(lockKey) === 'locked') {
            deferred.reject('last_call_interrupted');
            deferred.promise.then(null, function() {
              persistenceStrategy.remove(lockKey);
            });
            return deferred.promise;
          }

          // Set stored and memory locks
          memoryLocks[lockKey] = true;
          persistenceStrategy.set(lockKey, 'locked');

          // Perform the async operation
          asyncFunction().then(function(successData) {
            deferred.resolve(successData);

            // Remove stored and memory locks
            delete memoryLocks[lockKey];
            persistenceStrategy.remove(lockKey);
          }, function(errorData) {
            deferred.reject(errorData);

            // Remove stored and memory locks
            delete memoryLocks[lockKey];
            persistenceStrategy.remove(lockKey);
          }, function(notifyData) {
            deferred.notify(notifyData);
          });

          return deferred.promise;
        }
      };
    }]
  };
})

/**
 * @ngdoc service
 * @name $ionicAutoTrack
 * @module ionic.service.analytics
 * @description
 *
 * Utility for auto tracking events. Every DOM event will go through a
 * list of hooks which extract meaningful data and add it to an event to Keen.
 *
 * Hooks should take a DOM event and return a dictionary of extracted properties, if any.
 *
 * @usage
 * ```javascript
 * $ionicAutoTrack.addHook(function(event) {
 *   if (event.type !== 'click') return;
 *
 *   return {
 *     my_extra_tracking_data: event.pageX
 *   };
 * });
 * ```
 */
.factory('$ionicAutoTrack', ['domSerializer', function(domSerializer) {

  // Array of handlers that events will filter through.
  var hooks = [];

  // Add a few handlers to start off our hooks
  // Handler for general click events
  hooks.push(function(event) {

    if (event.type !== 'click') return;

    // We want to also include coordinates as a percentage relative to the target element
    var x = event.pageX,
        y = event.pageY,
        box = event.target.getBoundingClientRect(),
        width = box.right - box.left,
        height = box.bottom - box.top,
        normX = (x - box.left) / width,
        normY = (y - box.top) / height;

    // Now get an xpath reference to the target element
    var elementSerialized = domSerializer.serializeElement(event.target);

    var tapData = {
      coords: {
        x: x,
        y: y
      },
      element: elementSerialized
    };

    if (isFinite(normX) && isFinite(normY)) {
      tapData.normCoords = {
        x: normX,
        y: normY
      };
    }

    return tapData;
  });

  // TODO fix handler for tab-item clicks
  // hooks.push(function(event) {
  //   if (event.type !== 'click') return;

  //   var item = ionic.DomUtil.getParentWithClass(event.target, 'tab-item', 3);
  //   if(!item) {
  //     return;
  //   }
  // });

  return {
    addHook: function(hook) {
      hooks.push(hook);
    },

    runHooks: function(domEvent) {

      // Event we'll actually send for analytics
      var trackingEvent;

      // Run the event through each hook
      for (var i = 0; i < hooks.length; i++) {
        var hookResponse = hooks[i](domEvent);
        if (hookResponse) {

          // Append the hook response to our tracking data
          if (!trackingEvent) trackingEvent = {};
          trackingEvent = angular.extend(trackingEvent, hookResponse);
        }
      }

      return trackingEvent;
    }
  };
}])


/**
 * @ngdoc directive
 * @name ionTrackClick
 * @module ionic.service.analytics
 * @restrict A
 * @parent ionic.directive:ionTrackClick
 *
 * @description
 *
 * A convenient directive to automatically track a click/tap on a button
 * or other tappable element.
 *
 * @usage
 * ```html
 * <button class="button button-clear" ion-track-click ion-track-event="cta-tap">Try now!</button>
 * ```
 */

.directive('ionTrackClick', ionTrackDirective('click'))
.directive('ionTrackTap', ionTrackDirective('tap'))
.directive('ionTrackDoubletap', ionTrackDirective('doubletap'))
.directive('ionTrackHold', ionTrackDirective('hold'))
.directive('ionTrackRelease', ionTrackDirective('release'))
.directive('ionTrackDrag', ionTrackDirective('drag'))
.directive('ionTrackDragLeft', ionTrackDirective('dragleft'))
.directive('ionTrackDragRight', ionTrackDirective('dragright'))
.directive('ionTrackDragUp', ionTrackDirective('dragup'))
.directive('ionTrackDragDown', ionTrackDirective('dragdown'))
.directive('ionTrackSwipeLeft', ionTrackDirective('swipeleft'))
.directive('ionTrackSwipeRight', ionTrackDirective('swiperight'))
.directive('ionTrackSwipeUp', ionTrackDirective('swipeup'))
.directive('ionTrackSwipeDown', ionTrackDirective('swipedown'))
.directive('ionTrackTransform', ionTrackDirective('hold'))
.directive('ionTrackPinch', ionTrackDirective('pinch'))
.directive('ionTrackPinchIn', ionTrackDirective('pinchin'))
.directive('ionTrackPinchOut', ionTrackDirective('pinchout'))
.directive('ionTrackRotate', ionTrackDirective('rotate'))


/**
 * @ngdoc directive
 * @name ionTrackAuto
 * @module ionic.service.analytics
 * @restrict A
 * @parent ionic.directive:ionTrackAuto
 *
 * @description
 *
 * Automatically track events on UI elements. This directive tracks heuristics to automatically detect
 * taps and interactions on common built-in Ionic components.
 *
 * None: this element should be applied on the body tag.
 *
 * @usage
 * ```html
 * <body ion-track-auto></body>
 * ```
 */
.directive('ionTrackAuto', ['$document', '$ionicAnalytics', '$ionicAutoTrack', function($document, $ionicAnalytics, $ionicAutoTrack) {
  return {
    restrict: 'A',
    link: function($scope, $element, $attr) {

      // Listen for events on the document body.
      // In the future we can listen for all kinds of events.
      $document.on('click', function(event) {
        var uiData = $ionicAutoTrack.runHooks(event);
        if (uiData) {
          var trackingEvent = {
            _ui: uiData
          }
          $ionicAnalytics.track('tap', trackingEvent);
        }
      });
    }
  }
}]);

/**
 * Generic directive to create auto event handling analytics directives like:
 *
 * <button ion-track-click="eventName">Click Track</button>
 * <button ion-track-hold="eventName">Hold Track</button>
 * <button ion-track-tap="eventName">Tap Track</button>
 * <button ion-track-doubletap="eventName">Double Tap Track</button>
 */
function ionTrackDirective(domEventName) {
  return ['$ionicAnalytics', '$ionicGesture', function($ionicAnalytics, $ionicGesture) {

    var gesture_driven = [
      'drag', 'dragstart', 'dragend', 'dragleft', 'dragright', 'dragup', 'dragdown',
      'swipe', 'swipeleft', 'swiperight', 'swipeup', 'swipedown',
      'tap', 'doubletap', 'hold',
      'transform', 'pinch', 'pinchin', 'pinchout', 'rotate'
    ];
    // Check if we need to use the gesture subsystem or the DOM system
    var isGestureDriven = false;
    for(var i = 0; i < gesture_driven.length; i++) {
      if(gesture_driven[i] == domEventName.toLowerCase()) {
        isGestureDriven = true;
      }
    }
    return {
      restrict: 'A',
      link: function($scope, $element, $attr) {
        var capitalized = domEventName[0].toUpperCase() + domEventName.slice(1);
        // Grab event name we will send
        var eventName = $attr['ionTrack' + capitalized];

        if(isGestureDriven) {
          var gesture = $ionicGesture.on(domEventName, handler, $element);
          $scope.$on('$destroy', function() {
            $ionicGesture.off(gesture, domEventName, handler);
          });
        } else {
          $element.on(domEventName, handler);
          $scope.$on('$destroy', function() {
            $element.off(domEventName, handler);
          });
        }


        function handler(e) {
          var eventData = $scope.$eval($attr.ionTrackData) || {};
          if(eventName) {
            $ionicAnalytics.track(eventName, eventData);
          } else {
            $ionicAnalytics.trackClick(e.pageX, e.pageY, e.target, {
              data: eventData
            });
          }
        }
      }
    }
  }];
}

})();
