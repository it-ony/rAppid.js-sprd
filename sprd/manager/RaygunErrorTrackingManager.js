define(["sprd/manager/IErrorTrackingManager", "require"], function (IErrorTrackingManager, require) {

    return IErrorTrackingManager.inherit("sprd.manager.RaygunErrorTrackingManager", {

        defaults: {
            apiKey: null,
            beforeSendFnc: null
        },

        _initializationComplete: function () {
            if (!this.$.enabled) {
                return;
            }

            if (!this.runsInBrowser()) {
                return;
            }

            var apiKey = this.$.apiKey;
            if (!apiKey) {
                this.log("Raygun apiKey not defined");
                return;
            }

            var self = this;
            setTimeout(function () {
                require(["sprd/lib/raygun"], function (Raygun) {

                    if (!Raygun) {
                        self.log("Raygun not found", "warn");
                        return;
                    }

                    Raygun.init(apiKey, {
                        allowInsecureSubmissions: true,  // IE8,
                        ignore3rdPartyErrors: true, // This option removes nonsense 'Script Error's from your Raygun dashboard
                        disablePulse: true
                    }).attach();

                    if(self.$.beforeSendFnc){
                        var scope = self.getScopeForFncName(self.$.beforeSendFnc);
                        if(scope && scope[self.$.beforeSendFnc] instanceof Function){
                            Raygun.onBeforeSend(function(payload){
                                if (payload && payload.Details && payload.Details.User) {
                                    localStorage.setItem("RayGunUser", JSON.stringify(payload.Details.User));
                                }
                                return scope[self.$.beforeSendFnc].call(scope, payload);
                            });
                        }

                    }

                    var version = self.$stage.$parameter.version;
                    if (version) {
                        Raygun.setVersion(version);
                    }

                    self._setTracker(Raygun);
                });
            }, 2000);

        }

    });

});