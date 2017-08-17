define(['sprd/model/ProductBase', 'js/core/List', 'sprd/data/ConfigurationTypeResolver', 'sprd/entity/DesignConfiguration', 'sprd/entity/TextConfiguration', 'sprd/entity/SpecialTextConfiguration', 'sprd/entity/Price', 'js/data/TypeResolver', 'js/data/Entity', "underscore", "flow", "sprd/manager/IProductManager", "sprd/error/ProductCreationError", 'sprd/model/ProductType', 'sprd/entity/Appearance', 'sprd/entity/BendingTextConfiguration'],
    function (ProductBase, List, ConfigurationTypeResolver, DesignConfiguration, TextConfiguration, SpecialTextConfiguration, Price, TypeResolver, Entity, _, flow, IProductManager, ProductCreationError, ProductType, Appearance, BendingTextConfiguration) {

        var undefined;

        return ProductBase.inherit("sprd.model.Product", {

            schema: {
                productType: ProductType,
                configurations: [new ConfigurationTypeResolver({
                    mapping: {
                        "design": DesignConfiguration,
                        "text": TextConfiguration,
                        "specialText": SpecialTextConfiguration,
                        "bendingText": BendingTextConfiguration
                    }
                })],
                appearance: {
                    type: Appearance,
                    isReference: true
                },
                restrictions: Object,
                defaultValues: Object,
                price: {
                    type: Price,
                    generated: true
                },
                creator: String,
                templateId: {
                    type: String,
                    required: false
                }
            },

            defaults: {
                configurations: List,
                creator: null
            },

            inject: {
                manager: IProductManager
            },

            ctor: function () {
                this.configurationsOnViewCache = {};

                this.callBase();

                var priceChangeHandler = function () {
                    this.trigger("priceChanged");
                };

                var productChangeHandler = function () {
                    this.trigger("productChanged");
                };

                var configurationAdd = function (e) {
                    var configuration = e.$.item,
                        viewId = configuration.get("printArea.getDefaultView().id");

                    if (viewId) {
                        // clear configuration cache
                        this.configurationsOnViewCache[viewId] = null;
                        this.trigger("configurationValidChanged");
                    }

                    this._setUpConfiguration(configuration);

                    if (configuration instanceof TextConfiguration) {
                        configuration._composeText();
                    }
                    priceChangeHandler.call(this);
                    productChangeHandler.call(this);

                };

                var configurationRemove = function (e) {
                    var configuration = e.$.item,
                        viewId = configuration.get("printArea.getDefaultView().id");

                    if (viewId) {
                        // clear configuration cache
                        this.configurationsOnViewCache[viewId] = null;
                        this.trigger("configurationValidChanged");
                    }

                    this._tearDownConfiguration(configuration);

                    productChangeHandler.call(this);
                    priceChangeHandler.call(this);
                };

                this.bind("configurations", "add", configurationAdd, this);
                this.bind("configurations", "remove", configurationRemove, this);
                this.bind("configurations", "reset", function () {
                    this.configurationsOnViewCache = {};
                    this.trigger("configurationValidChanged");

                    priceChangeHandler.call(this);
                    productChangeHandler.call(this);
                }, this);

                this.bind("configurations", "item:priceChanged", priceChangeHandler, this);
                this.bind('configurations', 'item:configurationChanged', productChangeHandler, this);
                this.bind('change:configurations', productChangeHandler, this);
                this.bind('configurations', 'item:change:printArea', function () {
                    this.configurationsOnViewCache = {};
                    this.trigger("configurationValidChanged");

                    productChangeHandler.call(this);
                }, this);

                this.bind('configurations', 'item:isValidChanged', function () {
                    this.trigger("configurationValidChanged");
                }, this);

                this.bind('configurations', 'item:change:offset', this._onConfigurationOffsetChanged, this);
                this.bind('change:productType', function() {
                    this.configurationsOnViewCache = {};
                }, this)
            },

            getDefaultAppearance: function () {
                var productType = this.$.productType;

                if (productType) {
                    return productType.getAppearanceById(this.get('appearance.id'));
                }

                return null;
            }.onChange('appearance', 'productType'),


            _onConfigurationOffsetChanged: function (e) {

                var manager = this.$.manager,
                    configuration = e.$.item;

                if (manager && manager.checkConfigurationOffset) {
                    manager.checkConfigurationOffset(this, configuration)
                }
            },

            configurationsOnViewError: function (view) {

                var errorValue = null,
                    configurations;

                if (!view) {
                    return null;
                }

                var viewId = view.$.id;

                var productType = this.$.productType;

                configurations = this.configurationsOnViewCache[viewId];
                if (!configurations && productType && productType.containsView(view)) {
                    this.configurationsOnViewCache[viewId] = configurations = this.getConfigurationsOnView(view);
                }

                if (!configurations) {
                    return null;
                }

                for (var i = 0; i < configurations.length; i++) {
                    var configuration = configurations[i];

                    if (!configuration.isValid() && configuration.$errors) {

                        for (var key in configuration.$errors.$) {
                            if (configuration.$errors.$.hasOwnProperty(key)) {
                                errorValue = configuration.$errors.$[key];
                                if (errorValue) {
                                    return {
                                        key: key,
                                        value: errorValue
                                    };
                                }
                            }
                        }
                    }
                }

                return null;

            }.on("configurationValidChanged"),

            _setUpConfiguration: function (configuration) {

                if (!this.$stage) {
                    return;
                }

                this.$stage.$bus.setUp(configuration);
            },

            _tearDownConfiguration: function (configuration) {

                if (!this.$stage) {
                    return;
                }

                this.$stage.$bus.tearDown(configuration);
            },

            _postConstruct: function () {

                var configurations = this.$.configurations,
                    self = this;

                if (configurations) {
                    configurations.each(function (configuration) {
                        self._setUpConfiguration(configuration);
                    });
                }
            },

            _preDestroy: function () {
                var configurations = this.$.configurations,
                    self = this;

                if (configurations) {
                    configurations.each(function (configuration) {
                        self._tearDownConfiguration(configuration);
                    });
                }
            },

            price: function () {

                // calculate price
                var price = new Price({
                    vatIncluded: this.get("productType.price.vatIncluded"),
                    currency: this.get('productType.price.currency')
                });
                this.$.configurations.each(function (configuration) {
                    price.add(configuration.price());
                });

                return price;

            }.on("priceChanged", ["productType", 'change:price']).onChange('productType'),

            _addConfiguration: function (configuration) {
                this.$.configurations.add(configuration);
            },

            removeExampleConfiguration: function () {
                if (this.get('restrictions.example') === true && this.$.configurations.size()) {
                    this.$.restrictions.example = false;
                    this.$.configurations.removeAt(0);
                }
            },

            getConfigurationsOnView: function (view) {

                view = view || this.$.view;

                var productType = this.$.productType;

                if (view && productType) {

                    if (productType.containsView(view)) {
                        return this.getConfigurationsOnPrintAreas(view.getPrintAreas());
                    } else {
                        throw new Error("View not on product type");
                    }

                }

                return [];

            },

            getConfigurationsOnPrintAreas: function (printAreas) {
                printAreas = printAreas || [];

                if (!(printAreas instanceof Array)) {
                    printAreas = [printAreas];
                }

                var ret = [];

                for (var i = 0; i < this.$.configurations.$items.length; i++) {
                    var configuration = this.$.configurations.$items[i];
                    if (_.contains(printAreas, configuration.$.printArea)) {
                        ret.push(configuration);
                    }
                }


                return ret;

            },

            fetch: function (options, callback) {
                var self = this,
                    fetchState = this._fetch.state;

                this.callBase(options, function (err) {
                    if (!err && fetchState !== 2) {
                        self.$originalProduct = self.clone();
                    }
                    callback && callback(err, self);
                });
            },

            hasChanges: function () {
                return !this.equals(this.$originalProduct);
            },

            equals: function (product) {
                return (this.$.configurations.isDeepEqual(product.$.configurations) &&
                    this.$.appearance.isDeepEqual(product.$.appearance) &&
                    this.$.productType.isDeepEqual(product.$.productType));
            },

            save: function (options, callback) {
                if (this.$originalProduct) {
                    if (this.hasChanges()) {
                        this.set('id', undefined);
                    } else {
                        this.set({
                            id: this.$originalProduct.$.id,
                            href: this.$originalProduct.$.href
                        });

                        callback && callback(null, this);
                        return;
                    }
                }

                var self = this;

                if (!this.$.creator) {
                    if (this.$stage && this.$stage.$application.name) {
                        this.set("creator", this.$stage.$application.name);
                    }
                }

                flow()
                    .seqEach(this.$.configurations.$items, function(configuration) {
                        if (configuration instanceof TextConfiguration) {
                            var text = configuration.$.textFlow.text(0, -1);
                            if (/^[\s\n\r]*$/.test(text)) {
                                self.$.configurations.remove(configuration);
                            }
                        }
                    })
                    .parEach(this.$.configurations.$items, function (configuration, cb) {
                        configuration.save(cb);
                    })
                    .seq(function (cb) {
                        ProductBase.prototype.save.call(self, options, cb);
                    })
                    .exec(function (err) {
                        if (!err) {
                            var clone = self.clone();
                            // change original product against the clone in the entity
                            // so that the application can work with the original product
                            self.$context.removeEntityFromCache(self);
                            self.$context.addEntityToCache(clone);

                            self.$originalProduct = clone;
                        } else {
                            err = ProductCreationError.createFromResponse(err);
                        }

                        callback && callback(err, self);
                    });

            },

            /***
             *
             * @param [options]
             * @param callback
             */
            init: function (options, callback) {

                if (options instanceof Function) {
                    callback = options;
                    options = {};
                }

                if (this.initialized) {
                    callback && callback(null, this);
                    return;
                }
                var self = this;

                flow()
                    .seq(function (cb) {
                        if (self.isNew()) {
                            cb();
                        } else {
                            self.fetch(null, cb);
                        }
                    })
                    .seq(function (cb) {
                        var productType = self.$.productType;
                        productType.fetch(null, cb);
                    })
                    .seq(function () {
                        var productType = self.$.productType;

                        var appearance;

                        if (self.$.appearance) {
                            appearance = productType.getAppearanceById(self.$.appearance.$.id);
                        }

                        appearance = appearance || productType.getDefaultAppearance();

                        self.set({
                            appearance: appearance,
                            view: self.$.view || productType.getViewById(self.get("defaultValues.defaultView.id")) || productType.getDefaultView()
                        });
                    })
                    .seq(function (cb) {
                        flow()
                            .parEach(self.$.configurations.$items, function (configuration, cb) {
                                self._setUpConfiguration(configuration);
                                configuration.init(options, cb);
                            })
                            .exec(function(err) {
                                cb(err);
                            });
                    })
                    .exec(function (err) {
                        self.trigger("productInitialized");
                        self.trigger("priceChanged");

                        if (err) {
                            callback && callback(err);
                        } else {
                            self.initialized = true;
                            callback && callback(null, self);
                        }
                    });
            },

            getAvailableAppearances: function () {
                var productType = this.$.productType;
                if (productType) {
                    var appearances = productType.getAvailableAppearances(),
                        configurations = this.$.configurations;
                    if (configurations) {
                        var ret = new List(appearances.toArray());
                        configurations.each(function (config) {
                            appearances.each(function (appearance) {
                                if (ret.contains(appearance)) {
                                    var printTypes = config.getPossiblePrintTypes(appearance);
                                    if (!printTypes || !printTypes.length) {
                                        ret.remove(appearance);
                                    }
                                }
                            });
                        });
                        return ret;
                    }
                    return appearances;
                }
                return null;
            }.onChange('productType.stockStates'),

            isReadyForCompose: function () {
                var ready = true;

                if (this.$.configurations) {
                    this.$.configurations.each(function (configuration) {
                        ready = ready && configuration.isReadyForCompose();
                    });
                }

                return ready;
            },

            getContainedMasks: function () {
                var configs = this.$.configurations;
                var masks = [];
                for (var i = 0; i < configs.length; i++) {
                    var config = configs.$items[i];
                    if (config.$.afterEffect) {
                        masks.push(config.$.afterEffect);
                    }
                }

                return masks;
            },

            _commitChangedAttributes: function (attributes) {
                this.callBase();
                if (attributes.hasOwnProperty("appearance") || attributes.hasOwnProperty("productType")) {
                    this.trigger("productChanged");
                }
            },

            sync: function () {
                var ret = this.callBase();
                if (ret) {
                    this._$source.initialized = false;
                }
                return ret;
            }
        });
    });
