# ion-scanner
A barcode scanner built with the Ionic Framework

(this project was built for a blog post that appears on [adamweeks.com](adamweeks.com), below is the contents of the blog post)

The Blog Post
----

Just when I thought I was out, they pulled me back in! After a year off of iOS programming, who knew that all the Angular work would bring me back to mobile.

After hearing about [Ionic Framework](http://ionicframework.com/) on [ng-air](http://angularair.podbean.com/e/05-ngair-ionic-framework/) I decided to check it out. Ionic is a mobile framework based on [Cordova](). It allows us to write multi-platform mobile apps with a native feel by using angular and custom ionic directives. You can read plenty on their site for more information, so let's get into it!


The Project
------
Of course, I have to make some sort of sample project when I'm learning a new platform, so I decided to write a basic barcode scanner app. 

First things first, let's install ionic:
```
$ npm install -g cordova ionic
```

When creating a new project, Ionic has a few different base templates to choose from. I created the `ion-scanner` project based off the tabs template:
```
$ ionic start ion-scanner tabs
```

Then we can add the ios platform simply by running:
```
$ ionic platform add ios
```

Since we don't want to write the barcode scanning software from scratch, we can use a plugin from [NgCordova](http://ngcordova.com/), a site that contains angular extensions for cordova. 
```
$ bower install ngCordova
```

Once that is installed, we can add the barcode scanner plugin found [here](http://ngcordova.com/docs/plugins/barcodeScanner/):
```
cordova plugin add https://github.com/wildabeast/BarcodeScanner.git
```

That is all the setup we need to be capable of making a barcode scanning application with Angular.

The Code
-----
My view is very simple. I've ripped out all but one tab from the sample project and emptied it (thinking about it now, I probably could have just used the empty template!). The main view has a "scan" button and a results area. 
`tab-home.html`:
```
<ion-view view-title="Scanner">
    <ion-content style="background: #e8ebf1;" class="padding">
        <div class="card">
            <div class="item">
                <button class="button button-block button-positive" ng-click="vm.scan()">
                    <i class="icon ion-qr-scanner"></i>
                    Scan Now
                </button>
            </div>
        </div>

        <div class="card">
            <div class="item item-divider">
                Scan Results
            </div>
            <div class="item item-text-wrap">
                {{vm.scanResults}}
            </div>
        </div>
    </ion-content>
</ion-view>
```
As you can see, there are some custom ionic directive that we are utilizing to give our application a more natural look. There are also lots of built in icons as well, you see we are using `ion-qr-scanner` on our button above.

In our controller, the most complicated thing about using the cordova plugins is knowing when the device is ready. Luckily, Ionic gives us `$ionicPlatform.ready()` function to throw our code into. Our controller with scanner looks like this: 
`controllers.js`
```
angular.module('scanner.controllers', [])
    .controller('HomeController', function($scope, $rootScope, $cordovaBarcodeScanner, $ionicPlatform) {
        var vm = this;

        vm.scan = function(){
            $ionicPlatform.ready(function() {
                $cordovaBarcodeScanner
                    .scan()
                    .then(function(result) {
                        // Success! Barcode data is here
                        vm.scanResults = "We got a barcode\n" +
                        "Result: " + result.text + "\n" +
                        "Format: " + result.format + "\n" +
                        "Cancelled: " + result.cancelled;
                    }, function(error) {
                        // An error occurred
                        vm.scanResults = 'Error: ' + error;
                    });
            });
        };

        vm.scanResults = '';
    });
```
Funny how there are more lines of code devoted to displaying scan results and errors than actually scanning. I've written this code in Objective-C before and even with the built in scanner for iOS 7, it was never this easy! 

Deploying
-----
Ionic allows us to test our code in a browser window, but since we are doing a barcode scanner, we really need to run our project on hardware. If you have an Apple developer account, you can simply run `ionic build ios` and then open the XCode project in the `platforms` folder. I imagine most Angular developers are not though, but there's an easy solution for that as well. Ionic now has [ionic.io](http://www.ionic.io), a deployment service that in conjunction with [Ionic View](http://view.ionic.io/) allows you to run apps on any device without having to do a native build. 

We won't go through the ionic.io setup process here because the [documentation](http://docs.ionic.io/v1.0/docs/user-quick-start) is so good. If you want to try it out follow along there.

Finally
-----
Our first steps into native mobile development with Ionic are complete. I'm looking forward to utilizing it some more!

You can download my barcode scanner app here: [https://github.com/adamweeks/ion-scanner](https://github.com/adamweeks/ion-scanner)

If you have any questions, feel free to contact me on twitter [@AdamWeeks](https://twitter.com/adamweeks). I also hang out with a great group on slack called [Angular Buddies](http://angularbuddies.com), so join us there!
 
