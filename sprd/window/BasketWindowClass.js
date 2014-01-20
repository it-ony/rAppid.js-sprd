define(["js/core/Window", "sprd/manager/TrackingManager", "sprd/manager/ApiBasketManager",
        "js/core/History", "underscore", 'sprd/manager/FeatureManager', "js/core/I18n", "js/core/Bus"],
    function (Window, TrackingManager, ApiBasketManager, History, _, FeatureManager, I18n, Bus) {

    return Window.inherit("sprd.window.BasketWindowClass", {
        inject: {
            basketManager: ApiBasketManager,
            tracking: TrackingManager,
            history: History,
            featureManager: FeatureManager,
            i18n: I18n,
            context: "context",
            bus: Bus
        },

        defaults: {
            basket: "{basketManager.basket}",
            basketItems: null,
            componentClass: "basket-window {basketStatusClass()}",
            closable: false,
            updatingBasket: false
        },

        $events: ["on:checkout"],

        ctor: function () {
            this.callBase();

            this.bind("basketManager", "on:basketChanged", function () {
                var itemsCount = this.get("basket.basketItems.$items.length");

                if (itemsCount === 0) {
                    this._emptyBasket();
                }

            }, this);

            this.bind("basketManager", "on:basketUpdated", function () {
                this.set("updatingBasket", false);
            }, this);

            this.bind("basketManager", "on:basketUpdating", function(){
                this.set("updatingBasket", true);
            }, this);
        },

        openProduct: function (e) {
            var target = e.target,
                product = target.$.product,
                self = this,
                wrapper = target.$parent,
                item = self.$.concreteElement.$.item;

            setTimeout(function () {
                var newProduct = product.clone();

                // first setup
                self.$.bus.setUp(newProduct);

                // then appearance
                newProduct.set('appearance', target.$.appearance);
                // then init
                newProduct.init(function () {
                    // clear product id to ensure, product gets validated again
                    newProduct.set('id', null);

                    item.set(newProduct.$);
                    wrapper.removeClass('loading');
                    // and then set to concreteElement
                    self.close(true);

                    self.$.bus.trigger('Application.newProductChanged', item);
                });

            }, 200);

            wrapper.addClass('loading');
        },

        onQuantityChange: function (e) {
            var basketItem = e.target.find('item');

            if (basketItem) {
                var value = e.target.$.value;
                if (_.isString(value) && !value.match(/^[0-9]{1,3}$/)) {
                    value = Number.NaN;
                } else {
                    value = parseInt(value);
                }

                if (isNaN(value) || value < 1) {
                    e.target.set("value", basketItem.$.quantity);
                } else {
                    basketItem.set('quantity', value);
                    this.updateBasket();
                }
            }
        },

        onSizeChange: function (e) {
            var basketItem = e.target.find('item');
            if (basketItem) {
                this.$.basket.mergeBasketItem(basketItem);
                this.updateBasket();
            }
        },

        updateBasket: function () {
            this.$.basketManager.saveBasketDebounced();
        },

        removeBasketItem: function (e, el) {
            var basketItem = el.find('item');
            this.$.basketManager.removeBasketItem(basketItem);
        },

        decreaseQuantity: function (e) {
            var item = e.target.find('item');
            item.decreaseQuantity();

            this.updateBasket();

        },

        increaseQuantity: function (e) {
            var item = e.target.find('item');
            item.increaseQuantity();

            this.updateBasket();
        },

        gt: function (quantity, b) {
            return quantity > b;
        },

        eql: function (a, b) {
            return a == b;
        },

        showVat: function () {
            return this.$stage.$parameter.platform != "NA";
        },

        showVatInfo: function () {
            this.$.bus.trigger("Confomat.showTaxInfo");
        },

        showShippingInfo: function () {
            this.$.bus.trigger("Confomat.showShippingInfo");
        },

        toUpperCase: function (str) {
            if (str) {
                return str.toUpperCase();
            }
            return str;
        },

        checkout: function () {
            this.trigger("on:checkout");
        },

        checkoutEnabled: function() {
            return !this.$.updatingBasket && this.get("basket.basketItems.$items.length")
        }.onChange("updatingBasket"),

        basketStatusClass: function () {
            return this.$.updatingBasket ? "updating" : "";
        }.onChange("updatingBasket"),

        _emptyBasket: function () {
            // HOOK: Will be overridden.
        },

        start: function (callback) {
            var self = this;
            this.$.basketManager.initBasket(function (err) {
                if (!err) {
                    self.set('basketItems', self.$.basket.$.basketItems);

                    var itemsCount = self.get(self.$.basket.$.basketItems, "$items.length");
                    if (itemsCount === 0) {
                        self._emptyBasket();
                    }
                }
                callback(err);
            });
        }
    });
});