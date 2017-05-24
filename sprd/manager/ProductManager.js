define(["sprd/manager/IProductManager", "underscore", "flow", "sprd/util/ProductUtil", 'text/entity/TextFlow', 'sprd/type/Style', 'sprd/entity/DesignConfiguration', 'sprd/entity/TextConfiguration', 'sprd/entity/SpecialTextConfiguration', 'text/operation/ApplyStyleToElementOperation', 'text/entity/TextRange', 'sprd/util/UnitUtil', 'js/core/Bus', 'sprd/manager/PrintTypeEqualizer', "sprd/entity/BendingTextConfiguration", "sprd/entity/Scale", "js/core/List", "sketchomat/util/PrintValidator"],
    function(IProductManager, _, flow, ProductUtil, TextFlow, Style, DesignConfiguration, TextConfiguration, SpecialTextConfiguration, ApplyStyleToElementOperation, TextRange, UnitUtil, Bus, PrintTypeEqualizer, BendingTextConfiguration, Scale, List, PrintValidator) {


        var PREVENT_VALIDATION_OPTIONS = {
            preventValidation: true
        };
        // factor * print area height = font size
        var INITIAL_FONT_SIZE_SCALE_FACTOR = 0.07;

        return IProductManager.inherit("sprd.manager.ProductManager", {

            inject: {
                bus: Bus
            },

            events: [
                "on:removedConfigurations"
            ],

            /***
             * set the product type and converts all configurations
             *
             * @param {sprd.model.Product} product
             * @param {sprd.model.ProductType} productType
             * @param {sprd.entity.Appearance} appearance
             * @param callback
             */
            setProductType: function(product, productType, appearance, callback) {
                if (appearance instanceof Function) {
                    callback = appearance;
                    appearance = null;
                }
                var self = this,
                    view;

                flow()
                    .seq(function(cb) {
                        productType.fetch(null, cb);
                    })
                    .seq(function() {
                        if (!appearance) {
                            if (product.$.appearance) {
                                appearance = productType.getClosestAppearance(product.$.appearance.getMainColor());
                            } else {
                                appearance = productType.getDefaultAppearance();
                            }
                        }
                    })
                    .seq(function() {
                        // determinate closest view for new product type
                        var currentView = product.$.view;

                        if (currentView) {
                            view = productType.getViewByPerspective(currentView.$.perspective);
                        }

                        if (!view) {
                            view = productType.getDefaultView();
                        }

                    })
                    .seq(function() {

                        // remove example configuration
                        if (product && product.get("restrictions.example") === true && product.$.configurations.size() > 0) {
                            product.$.restrictions.example = false;
                            var configuration = product.$.configurations.at(0);
                            product.$.configurations.remove(configuration);
                        }

                        self.convertConfigurations(product, productType, appearance);
                    })
                    .seq(function() {
                        // first set product type
                        // and then the appearance, because appearance depends on product type
                        product.set({
                            productType: productType,
                            view: view,
                            appearance: appearance
                        });

                        self.$.bus.trigger('Application.productChanged', product);
                    })
                    .exec(callback);

            },

            setAppearance: function(product, appearance) {

                if (product.$.appearance.$.id === appearance.$.id) {
                    // same appearance, nothing to do
                    return;
                }

                this.convertConfigurations(product, product.$.productType, appearance);
                product.set({
                    appearance: appearance
                });
                this.$.bus && this.$.bus.trigger('Application.productChanged', product);
            },

            /***
             * Converts the configurations of a product with the given productType and appearance
             * @param {sprd.model.Product} product
             * @param {sprd.model.ProductType} productType
             * @param {sprd.entity.Appearance} appearance
             */
            convertConfigurations: function(product, productType, appearance) {
                var configurations = product.$.configurations.$items,
                    removeConfigurations = [],
                    setOptions = {silent: true};

                for (var i = 0; i < configurations.length; i++) {
                    var configuration = configurations[i],
                        currentPrintArea = configuration.$.printArea,
                        currentView = currentPrintArea.getDefaultView(),
                        targetView = null,
                        targetPrintArea = null;

                    if (currentView) {
                        targetView = productType.getViewByPerspective(currentView.$.perspective);
                    }

                    if (targetView) {
                        targetPrintArea = targetView.getDefaultPrintArea();
                    }

                    if (!targetPrintArea) {
                        targetPrintArea = productType.getDefaultPrintArea();
                    }

                    var possiblePrintTypes;
                    var printAreas = [targetPrintArea].concat(productType.$.printAreas.$items);

                    targetPrintArea = null;

                    // search for the best print area
                    for (var p = 0; p < printAreas.length; p++) {
                        var printArea = printAreas[p];

                        if (printArea && configuration.isAllowedOnPrintArea(printArea)) {
                            possiblePrintTypes = configuration.getPossiblePrintTypesForPrintArea(printArea, appearance.$.id);

                            if (possiblePrintTypes.length > 0) {
                                targetPrintArea = printArea;
                                break;
                            }
                        }

                    }

                    if (targetPrintArea && configuration.isAllowedOnPrintArea(targetPrintArea)) {
                        configuration.set('printArea', targetPrintArea, setOptions);

                        var currentPrintAreaWidth = currentPrintArea.get("boundary.size.width");
                        var currentPrintAreaHeight = currentPrintArea.get("boundary.size.height");
                        var targetPrintAreaWidth = targetPrintArea.get("boundary.size.width");
                        var targetPrintAreaHeight = targetPrintArea.get("boundary.size.height");

                        var preferredPrintType = null;
                        var preferredScale = null;
                        var preferredOffset = null;

                        var currentConfigurationWidth = configuration.width();
                        var currentConfigurationHeight = configuration.height();

                        // find new print type

                        var printType = configuration.$.printType;

                        var center = {
                            x: configuration.$.offset.$.x + currentConfigurationWidth / 2,
                            y: configuration.$.offset.$.y + currentConfigurationHeight / 2
                        };

                        // if digital print type
                        if (!printType.isPrintColorColorSpace()) {
                            var pt;
                            // try to find another digital print type which is before the current print type
                            // this is needed to switch back from DD to DT
                            for (var k = 0; k < possiblePrintTypes.length; k++) {
                                pt = possiblePrintTypes[k];
                                if (!pt.isPrintColorColorSpace()) {
                                    printType = pt;
                                    break;
                                }
                            }
                        }

                        if (printType && !_.contains(possiblePrintTypes, printType)) {
                            // print type not possible any more
                            printType = null;
                        }

                        if (printType) {
                            var index = _.indexOf(possiblePrintTypes, printType);
                            if (index >= 0) {
                                // remove print type from original position
                                possiblePrintTypes.splice(index, 1);
                            }

                            // and add it to first position
                            possiblePrintTypes.unshift(printType);
                        }

                        var scale = configuration.get('scale') || {x: 1, y: 1};

                        var optimalScale = Math.abs(scale.x);

                        if (product.$.productType !== productType) {
                            optimalScale = Math.min(
                                    targetPrintAreaWidth / currentPrintAreaWidth,
                                    targetPrintAreaHeight / currentPrintAreaHeight
                                ) * Math.abs(scale.x);
                        }

                        var allowScale = configuration.allowScale(),
                            printTypeFallback = null;

                        for (var j = 0; j < possiblePrintTypes.length; j++) {
                            printType = possiblePrintTypes[j];
                            var factor = optimalScale;

                            if (!printType.isPrintColorColorSpace() && !configuration.$.printType.isPrintColorColorSpace()) {
                                // digital to digital conversion
                                factor = optimalScale * printType.$.dpi / configuration.get("printType.dpi");
                            }

                            var minimumScale = null;

                            if (printType.isEnlargeable()) {
                                minimumScale = configuration.minimumScale();
                            }

                            var configurationPrintTypeSize = configuration.getSizeForPrintType(printType);

                            var maximumScale = Math.min(
                                printType.get("size.width") / configurationPrintTypeSize.$.width,
                                printType.get("size.height") / configurationPrintTypeSize.$.height,
                                targetPrintAreaWidth / configurationPrintTypeSize.$.width,
                                targetPrintAreaHeight / configurationPrintTypeSize.$.height
                            );

                            if (printType.isShrinkable()) {
                                maximumScale = Math.min(1, maximumScale);
                            }


                            if (!allowScale && (maximumScale < 1 || (minimumScale && minimumScale > 1))) {
                                continue;
                            }

                            if (minimumScale && minimumScale > maximumScale) {
                                continue;
                            }

                            if (minimumScale) {
                                factor = Math.max(factor, minimumScale);
                            }
                            factor = Math.min(factor, maximumScale);

                            preferredScale = {
                                x: factor,
                                y: factor
                            };

                            if (!printTypeFallback) {
                                printTypeFallback = printType
                            }

                            preferredScale = {
                                x: factor,
                                y: factor
                            };

                            var result = configuration._validatePrintTypeSize(printType, currentConfigurationWidth, currentConfigurationHeight, preferredScale);
                            if (result.minBound || result.maxBound || result.dpiBound) {
                                continue;
                            }

                            preferredPrintType = printType;
                            break;
                        }

                        preferredPrintType = preferredPrintType || printTypeFallback;

                        if (preferredPrintType) {

                            configuration.set({
                                printType: preferredPrintType,
                                scale: preferredScale
                            });

                            preferredOffset = {
                                x: targetPrintAreaWidth * center.x / currentPrintAreaWidth - configuration.width() / 2,
                                y: targetPrintAreaHeight * center.y / currentPrintAreaHeight - configuration.height() / 2
                            };

                            configuration.$.offset.set(preferredOffset);

                            // set again with force to trigger events
                            configuration.set({
                                printType: preferredPrintType,
                                scale: preferredScale,
                                printArea: targetPrintArea
                            }, {force: true});
                        } else {
                            // remove configuration
                            removeConfigurations.push(configuration);
                        }

                    } else {
                        // no print area found, remove configuration
                        removeConfigurations.push(configuration);
                    }
                }

                if (removeConfigurations.length) {
                    this.trigger('on:removedConfigurations', {configurations: removeConfigurations}, this);
                }

                product.$.configurations.remove(removeConfigurations);
            },

            getTargetPrintArea: function(product, params) {
                var view = params.view,
                    printArea = params.printArea,
                    perspective = params.perspective,
                    productType = product.$.productType;

                if (!printArea && perspective && !view) {
                    view = productType.getViewByPerspective(perspective);
                }

                if (!printArea && view) {
                    if (!productType.containsView(view)) {
                        throw new Error("View not on ProductType");
                    }

                    // TODO: look for print area that supports print types, etc...
                    printArea = view.getDefaultPrintArea();
                }

                view = product.$.view || product.getDefaultView();
                if (!printArea && view) {
                    printArea = view.getDefaultPrintArea();
                }

                return printArea;
            },

            getPrintTypesForDesign: function(product, design, printArea, printType, appearance) {
                appearance = appearance || product.$.appearance;
                var possiblePrintTypes = ProductUtil.getPossiblePrintTypesForDesignOnPrintArea(design, printArea, appearance.$.id);

                if (printType && !_.contains(possiblePrintTypes, printType)) {
                    throw new Error("PrintType not possible for design and printArea");
                }

                printType = PrintTypeEqualizer.getPreferredPrintType(product, printArea, possiblePrintTypes) || printType || possiblePrintTypes[0];

                if (!printType) {
                    throw new Error("No printType available");
                }

                return this.moveItem(possiblePrintTypes, printType);
            },


            moveItem: function(array, item, i) {
                i = i || 0;
                var index = array.indexOf(item);
                if (index !== -1) {
                    array.splice(index, 1);
                    array.splice(i, 0, item);
                }

                return array;
            },

            /**
             * Adds a design to a given Product
             * @param {sprd.model.Product} product
             * @param {Object} params
             * @param {Function} callback
             */
            addDesign: function(product, params, callback) {
                params = _.defaults({}, params, {
                    design: null,
                    perspective: null, // front, back, etc...
                    view: null,
                    printArea: null,
                    printType: null,
                    designColorRGBs: null,
                    designColorIds: null
                });

                var self = this,
                    bus = this.$.bus,
                    design = params.design,
                    productType = product.$.productType,
                    printArea = params.printArea,
                    view = params.view,
                    appearance = product.$.appearance,
                    printType = params.printType;

                if (!design) {
                    callback(new Error("No design"));
                    return;
                }

                if (!productType) {
                    callback(new Error("ProductType not set"));
                    return;
                }

                if (!appearance) {
                    callback(new Error("Appearance for product not set"));
                    return;
                }

                flow()
                    .par(function(cb) {
                        design.fetch(null, cb);
                    }, function(cb) {
                        productType.fetch(null, cb);
                    })
                    .seq("printArea", function() {
                        var printArea = self.getTargetPrintArea(product, params);
                        if (!printArea.get("restrictions.designAllowed")) {
                            throw new Error("designs cannot be added to this print area");
                        }

                        return printArea;
                    })
                    .seq("printTypes", function() {
                        var printTypes = self.getPrintTypesForDesign(product, design, this.vars.printArea, printType);
                        printType = printTypes[0];
                        return printTypes;
                    })
                    .seq("designConfiguration", function() {
                        var entity = product.createEntity(DesignConfiguration);
                        entity.set({
                            printType: printType,
                            printArea: printArea,
                            design: design,
                            designColorIds: params.designColorIds,
                            designColorRGBs: params.designColorRGBs
                        }, PREVENT_VALIDATION_OPTIONS);
                        return entity;
                    })
                    .seq(function(cb) {
                        var designConfiguration = this.vars["designConfiguration"];
                        bus.setUp(designConfiguration);
                        designConfiguration.init({}, cb);
                    })
                    .seq('validatedMove', function() {
                        return self.getValidatedMove(this.vars.printTypes, this.vars.printArea, this.vars.designConfiguration, product);
                    })
                    .seq(function(cb) {
                        if (!this.vars.validatedMove) {
                            return cb();
                        }
                        this.vars.validatedMove.printType.fetch(null, cb);
                    })
                    .exec(function(err, results) {
                        if (!err && results.validatedMove) {
                            self._moveConfigurationToView(product, results.designConfiguration, results.validatedMove.printType, results.printArea, {transform: results.validatedMove.transform});
                        }
                        callback && callback(err, results.designConfiguration);
                    });
            },

            addText: function(product, params, callback) {

                var self = this;

                var finalizeFnc = function(configuration, params) {

                    configuration.$.selection.set({
                        activeIndex: configuration.$.textFlow.textLength() - 1,
                        anchorIndex: 0
                    });

                    configuration.set('isNew', params.isNew);

                    configuration.set("maxHeight", 1);

                    // determinate position
                    self._positionConfiguration(configuration);

                    configuration.set("maxHeight", null);

                };

                var configurationFnc = function(params, text, printType, printArea, font, printTypeColor) {

                    var textFlow = TextFlow.initializeFromText(text);

                    var fontSize = params.fontSize;

                    if (!printType.isPrintColorColorSpace()) {
                        fontSize = INITIAL_FONT_SIZE_SCALE_FACTOR * printArea.get('_size.height');
                    }

                    (new ApplyStyleToElementOperation(TextRange.createTextRange(0, textFlow.textLength()), textFlow, new Style({
                        font: font,
                        fontSize: fontSize,
                        lineHeight: 1.2,
                        printTypeColor: printTypeColor
                    }), new
                        Style({
                        textAnchor: "middle"
                    }))).doOperation();

                    var entity = product.createEntity(TextConfiguration);

                    entity.set({
                        printType: printType,
                        printArea: printArea,
                        textFlow: textFlow,
                        selection: TextRange.createTextRange(0, textFlow.textLength())
                    });
                    return entity;

                };

                this._addText(product, params, configurationFnc, finalizeFnc, callback);


            },

            addBendingText: function(product, params, callback) {

                var self = this;

                var createConfigurationFnc = function(params, text, printType, printArea, font, printTypeColor) {
                    var fontSize = params.fontSize,
                        printColors = new List;

                    printColors.add(printTypeColor);

                    var entity = product.createEntity(BendingTextConfiguration);

                    entity.set({
                        printType: printType,
                        printArea: printArea,
                        text: text,
                        fontSize: fontSize,
                        font: font,
                        printColors: printColors
                    });
                    return entity;
                };

                var finalizeFnc = function(configuration) {
                    configuration.set('isNew', params.isNew);

                    configuration.set("maxHeight", 1);

                    // determinate position
                    self._positionConfiguration(configuration);

                    configuration.set("maxHeight", null);
                };


                this._addText(product, params, createConfigurationFnc, finalizeFnc, callback)
            },

            _addText: function(product, params, createConfigurationFnc, finalizeFnc, callback) {

                params = _.defaults({}, params, {
                    text: null,
                    fontFamily: null,
                    perspective: null, // front, back, etc...
                    view: null,
                    printArea: null,
                    printType: null,
                    font: null,
                    fontStyle: "normal",
                    fontWeight: "normal",
                    printTypeId: null,
                    fontFamilyId: null,
                    fontFamilyName: "Arial",
                    addToProduct: true,
                    isNew: true,
                    fontSize: 25,
                    printColor: null
                });

                var self = this,
                    context = product.$context.$contextModel,
                    text = params.text,
                    bus = this.$.bus,
                    productType = product.$.productType,
                    printArea = params.printArea,
                    view = params.view,
                    font = null,
                    appearance = product.$.appearance,
                    printType = params.printType,
                    printTypeId = params.printTypeId,
                    printColor = params.printColor;

                if (!text) {
                    callback(new Error("No text"));
                    return;
                }

                if (!productType) {
                    callback(new Error("ProductType not set"));
                    return;
                }

                if (!appearance) {
                    callback(new Error("Appearance for product not set"));
                    return;
                }

                flow()
                    .par({
                        fontFamilies: function(cb) {
                            if (params.fontFamily) {
                                cb();
                            } else {
                                context.$.fontFamilies.fetch({
                                    fullData: true
                                }, cb);
                            }
                        },
                        productType: function(cb) {
                            productType.fetch(null, cb);
                        }
                    })
                    .seq("fontFamily", function() {
                        var fontFamily,
                            fontFamilies = this.vars['fontFamilies'];

                        if (params.font && params.fontFamily) {
                            font = params.font;
                            return params.fontFamily;
                        }

                        if (params.fontFamily) {
                            fontFamily = params.fontFamily;
                        } else if (params.fontFamilyId) {
                            var items = fontFamilies.$items;

                            for (var i = items.length; i--;) {
                                if (items[i].$.id == params.fontFamilyId) {
                                    fontFamily = items[i];
                                    break;
                                }
                            }
                        } else if (params.fontFamilyName) {
                            fontFamily = fontFamilies.find(function(fontFamily) {
                                return fontFamily.$.name === params.fontFamilyName;
                            });
                        }

                        // use first font that is not deprecated
                        fontFamily = fontFamily || fontFamilies.find(function(fontFamily) {
                                return !fontFamily.$.deprecated
                            });

                        if (!fontFamily) {
                            throw new Error("No found");
                        }

                        font = fontFamily.getFont(params.fontWeight, params.fontStyle);

                        if (!font) {
                            product.log("Font with for required style & weight not found. Fallback to default font", "warn");
                        }

                        font = font || fontFamily.getDefaultFont();

                        if (!font) {
                            throw new Error("No font in family found");
                        }

                        return fontFamily;
                    })
                    .seq("printArea", function() {

                        if (!printArea && params.perspective && !view) {
                            view = productType.getViewByPerspective(params.perspective);
                        }

                        if (!printArea && view) {
                            // get print area by view
                            if (!productType.containsView(view)) {
                                throw new Error("View not on ProductType");
                            }

                            // TODO: look for print area that supports print types, etc...
                            printArea = view.getDefaultPrintArea();
                        }

                        view = product.$.view || product.getDefaultView();
                        if (!printArea && view) {
                            printArea = view.getDefaultPrintArea();
                        }

                        if (!printArea) {
                            throw new Error("target PrintArea couldn't be found.");
                        }

                        if (printArea.get("restrictions.textAllowed") === false) {
                            throw new Error("text cannot be added to this print area");
                        }

                        return printArea;
                    })
                    .seq("printType", function() {
                        var fontFamily = this.vars.fontFamily;
                        var possiblePrintTypes = ProductUtil.getPossiblePrintTypesForTextOnPrintArea(fontFamily, printArea, appearance.$.id);

                        if (printType && !_.contains(possiblePrintTypes, printType)) {
                            throw new Error("PrintType not possible for text and printArea");
                        }

                        if (printTypeId) {
                            for (var i = possiblePrintTypes.length; i--;) {
                                if (possiblePrintTypes[i].$.id == printTypeId) {
                                    printType = possiblePrintTypes[i];
                                    break;
                                }
                            }
                        }

                        printType = PrintTypeEqualizer.getPreferredPrintType(product, printArea, possiblePrintTypes) || printType || possiblePrintTypes[0];

                        if (!printType) {
                            throw new Error("No printType available");
                        }

                        return printType;
                    })
                    .seq(function(cb) {
                        printType.fetch(null, cb);
                    })
                    .seq("printTypeColor", function() {
                        var color = product.appearanceBrightness() !== "dark" ? "#000000" : "#FFFFFF";

                        if (printColor) {
                            color = printType.getClosestPrintColor(printColor.toHexString());
                        } else {
                            color = printType.getClosestPrintColor(color);
                        }


                        if (!color) {
                            throw "No print type color";
                        }

                        return color;
                    })
                    .seq("configuration", function() {
                        return createConfigurationFnc(params, text, printType, printArea, font, this.vars.printTypeColor);
                    })
                    .seq(function(cb) {
                        var configuration = this.vars["configuration"];
                        bus.setUp(configuration);
                        configuration.init({}, cb);
                    })
                    .seq(function() {
                        finalizeFnc(this.vars.configuration, params);
                    })
                    .exec(function(err, results) {
                        if (!err && params.addToProduct) {
                            product.removeExampleConfiguration();
                            product._addConfiguration(results.configuration);
                        }
                        callback && callback(err, results.configuration);
                        params.addToProduct && self.$.bus.trigger('Application.productChanged', product);
                    });

            },

            addSpecialText: function(product, params, callback) {

                params = _.defaults({}, params, {
                    text: null,
                    perspective: null, // front, back, etc...
                    view: null,
                    printArea: null,
                    printType: null,
                    printTypeId: null,
                    font: null,
                    addToProduct: true,
                    isNew: true
                });

                var self = this,
                    text = params.text,
                    bus = this.$.bus,
                    productType = product.$.productType,
                    printArea = params.printArea,
                    view = params.view,
                    font = params.font,
                    appearance = product.$.appearance,
                    printType = params.printType,
                    printTypeId = params.printTypeId;

                if (!text) {
                    callback(new Error("No text"));
                    return;
                }

                if (!productType) {
                    callback(new Error("ProductType not set"));
                    return;
                }

                if (!font) {
                    callback(new Error("Font not set"));
                    return;
                }

                if (!appearance) {
                    callback(new Error("Appearance for product not set"));
                    return;
                }

                flow()
                    .seq("productType", function(cb) {
                        productType.fetch(null, cb);
                    })
                    .seq("printArea", function() {

                        if (!printArea && params.perspective && !view) {
                            view = productType.getViewByPerspective(params.perspective);
                        }

                        if (!printArea && view) {
                            // get print area by view
                            if (!productType.containsView(view)) {
                                throw new Error("View not on ProductType");
                            }

                            // TODO: look for print area that supports print types, etc...
                            printArea = view.getDefaultPrintArea();
                        }

                        view = product.$.view || product.getDefaultView();
                        if (!printArea && view) {
                            printArea = view.getDefaultPrintArea();
                        }

                        if (!printArea) {
                            throw new Error("target PrintArea couldn't be found.");
                        }

                        if (!(printArea.get("restrictions.textAllowed") === true &&
                            printArea.get("restrictions.designAllowed") === true)) {
                            throw new Error("special text cannot be added to this print area");
                        }

                        return printArea;
                    })
                    .seq("printType", function() {

                        var possiblePrintTypes = ProductUtil.getPossiblePrintTypesForSpecialText(printArea, appearance.$.id);

                        if (printType && !_.contains(possiblePrintTypes, printType)) {
                            throw new Error("PrintType not possible for text and printArea");
                        }

                        if (printTypeId) {
                            for (var i = possiblePrintTypes.length; i--;) {
                                if (possiblePrintTypes[i].$.id == printTypeId) {
                                    printType = possiblePrintTypes[i];
                                    break;
                                }
                            }
                        }

                        printType = PrintTypeEqualizer.getPreferredPrintType(product, printArea, possiblePrintTypes) || printType || possiblePrintTypes[0];

                        if (!printType) {
                            throw new Error("No printType available");
                        }

                        return printType;
                    })
                    .seq(function(cb) {
                        printType.fetch(null, cb);
                    })
                    .seq("configuration", function() {

                        var entity = product.createEntity(SpecialTextConfiguration);

                        entity.set({
                            printType: printType,
                            printArea: printArea,
                            text: text,
                            font: font
                        });

                        return entity;
                    })
                    .seq(function(cb) {
                        var configuration = this.vars["configuration"];
                        bus.setUp(configuration);
                        configuration.init({}, cb);

                        configuration.set('isNew', params.isNew);
                    })
                    .seq(function() {
                        var configuration = this.vars["configuration"];
                        // determinate position
                        self._positionConfiguration(configuration);

                        if (params.offset) {
                            configuration.set({'offset': params.offset}, PREVENT_VALIDATION_OPTIONS);
                        }
                        if (params.scale) {
                            configuration.set('scale', params.scale, PREVENT_VALIDATION_OPTIONS);
                        }
                    })
                    .exec(function(err, results) {
                        if (!err && params.addToProduct) {
                            product.removeExampleConfiguration();
                            product._addConfiguration(results.configuration);
                        }
                        callback && callback(err, results.configuration);
                        params.addToProduct && self.$.bus.trigger('Application.productChanged', product);
                    });

            },

            getPrintType: function(printArea, configuration, product) {
                var possiblePrintTypes,
                    fontFamily = null,
                    appearanceId = product.get('appearance.id');

                if (configuration instanceof SpecialTextConfiguration) {
                    possiblePrintTypes = ProductUtil.getPossiblePrintTypesForSpecialText(printArea, appearanceId);
                } else if (configuration instanceof TextConfiguration) {
                    fontFamily = configuration.$.textFlow.findLeaf(0).$.style.$.font.$parent;
                    possiblePrintTypes = ProductUtil.getPossiblePrintTypesForTextOnPrintArea(fontFamily, printArea, appearanceId);
                } else if (configuration instanceof DesignConfiguration) {
                    possiblePrintTypes = ProductUtil.getPossiblePrintTypesForDesignOnPrintArea(configuration.$.design, printArea, appearanceId);
                    possiblePrintTypes = _.filter(possiblePrintTypes, function(printType) {
                        return PrintValidator.canBePrintedSinglePrintType(configuration.$.design, printType, printArea)
                    });
                } else if (configuration instanceof BendingTextConfiguration) {
                    fontFamily = configuration.$.font.getFontFamily();
                    possiblePrintTypes = ProductUtil.getPossiblePrintTypesForTextOnPrintArea(fontFamily, printArea, appearanceId);
                }

                var printType = PrintTypeEqualizer.getPreferredPrintType(product, printArea, possiblePrintTypes) || possiblePrintTypes[0];

                if (!printType) {
                    throw new Error("No printType available");
                }

                return printType;
            },

            _moveConfigurationToView: function(product, configuration, printType, printArea) {
                var self = this,
                    bus = this.$.bus;

                if (!printType && !printArea) {
                    printType = configuration.$.printType;
                    printArea = configuration.$.printArea;
                }

                product.$.configurations.remove(configuration);
                configuration.set({
                    rotation: 0,
                    scale: {x: 1, y: 1},
                    printType: printType,
                    printArea: printArea
                }, {silent: true});
                configuration.mainConfigurationRenderer = null;

                configuration.clearErrors();
                self._positionConfiguration(configuration);

                product._addConfiguration(configuration);
                bus.trigger('Application.productChanged', null);
            },

            moveConfigurationToView: function(product, configuration, view, callback) {

                var self = this,
                    printArea,
                    printType,
                    validations;

                view = view || product.$.view || product.getDefaultView();

                flow()
                    .seq(function() {
                        printArea = self.getPrintArea(view, product.$.productType);
                    })
                    .seq(function() {
                        var possiblePrintTypes = configuration.getPossiblePrintTypesForPrintArea(printArea, product.get('appearance.id'));
                        printType = self.getPrintType(printArea, configuration, product);
                    })
                    .seq(function(cb) {
                        printType.fetch(null, cb);
                    })
                    .seq(function() {
                        validations = self.validateMove(printType, printArea, configuration, product);
                    })
                    .exec(function(err) {
                        if (!err) {
                            var valid = validations && _.every(validations, function(val) {
                                    return !val;
                                });

                            if (valid) {
                                self._moveConfigurationToView(product, configuration, printType, printArea);
                                callback && callback();
                            } else {
                                self._moveConfigurationToView(product, configuration, configuration.$.printType, configuration.$.printArea);
                                callback && callback(new Error('Validation errors found. Configuration moved to old view'));
                            }
                        } else {
                            self._moveConfigurationToView(product, configuration, configuration.$.printType, configuration.$.printArea);
                            callback && callback(new Error('Something went wrong preparing the move of the configuration.'));
                        }
                    });
            },

            getValidatedMove: function(printTypes, printArea, configuration, product) {
                if (!(printTypes instanceof Array)) {
                    printTypes = [printTypes];
                }

                if (configuration instanceof DesignConfiguration && configuration.$.design
                    && !PrintValidator.canBePrinted(configuration.$.design, product, printTypes, printArea)) {
                    return null;
                }

                this.moveItem(printTypes, PrintTypeEqualizer.getPreferredPrintType(product, printArea, printTypes), 0);

                var validatedMove = null,
                    self = this;
                _.find(printTypes, function(printType) {
                    validatedMove = self.validateConfigurationMove(printType, printArea, configuration);
                    return validatedMove && _.every(validatedMove.validations, function(validation) {
                            return !validation;
                        });
                });

                return validatedMove;
            },

            validateMove: function(printTypes, printArea, configuration, product) {
                if (!(printTypes instanceof Array)) {
                    printTypes = [printTypes];
                }

                if (configuration instanceof DesignConfiguration && configuration.$.design
                    && !PrintValidator.canBePrinted(configuration.$.design, product, printTypes, printArea)) {
                    return null;
                }

                var validationsForTypes = this.validateConfigurationMoveList(printTypes, printArea, configuration, product);
                return _.some(validationsForTypes, function(validations) {
                    return validations && _.every(validations, function(validation) {
                            return !validation;
                        });
                });
            },

            validateConfigurationMoveList: function(printTypes, printArea, configuration, product) {
                var ret = [];
                for (var i = 0; i < printTypes.length; i++) {
                    var validatedMove = this.validateConfigurationMove(printTypes[i], printArea, configuration, product);
                    ret.push(validatedMove && validatedMove.validations);
                }

                return ret;
            },

            validateConfigurationMove: function(printType, printArea, configuration, product) {
                try {
                    var transform = this.getConfigurationPosition(configuration, printArea, printType);
                    var validations = configuration._validatePrintTypeSize(printType, configuration.width(transform.scale.x), configuration.height(transform.scale.y), transform.scale);
                    return {
                        printType: printType,
                        validations: validations,
                        transform: transform
                    }
                } catch (e) {
                    return null;
                }
            },

            getPrintArea: function(view, productType) {
                if (!view) {
                    throw new Error("No view supplied");
                }

                if (!productType.containsView(view)) {
                    throw new Error("View not on ProductType");
                }

                // TODO: look for print area that supports print types, etc...
                return view.getDefaultPrintArea();
            },

            moveConfigurationsToView: function(product, configurations, view, callback) {
                var self = this;
                flow()
                    .parEach(configurations.toArray(), function(config, cb) {
                        self.moveConfigurationToView(product, config, view, function(err, result) {
                            cb();
                        });
                    })
                    .exec(callback)
            },

            setTextForConfiguration: function(text, configuration, options) {
                if (!(configuration instanceof TextConfiguration)) {
                    throw new Error("Configuration is not a TextConfiguration");
                }

                options = options || {};

                var textFlow = TextFlow.initializeFromText(text),
                    textRange = TextRange.createTextRange(0, textFlow.textLength()),
                    firstLeaf = configuration.$.textFlow.getFirstLeaf(),
                    paragraph,
                    leafStyle,
                    paragraphStyle;

                if (firstLeaf) {
                    paragraph = firstLeaf.$parent || this.get(configuration, "textFlow.children.at(0)");
                    leafStyle = firstLeaf.$.style;
                    if (paragraph) {
                        paragraphStyle = paragraph.$.style;
                    }
                }

                leafStyle.$.fontSize = options.fontSize || leafStyle.$.fontSize;
                leafStyle.$.font = options.font || leafStyle.$.font;

                var operation = new ApplyStyleToElementOperation(textRange, textFlow, leafStyle, paragraphStyle);
                operation.doOperation();

                configuration.$.selection && configuration.$.selection.set({
                    activeIndex: 0,
                    anchorIndex: 0
                });
                configuration.set('textFlow', textFlow);
                textFlow.trigger('operationComplete', null, textFlow);
                this.$.bus.trigger('Application.productChanged', null);
            },

            clamp: function(value, min, max) {

                if (min > max) {
                    throw new Error('Min is bigger than max.');
                }

                return Math.min(Math.max(value, min), max);
            },

            centerAt: function(x, y, rect) {
                return {
                    x: x - rect.width / 2,
                    y: y - rect.height / 2
                }
            },

            _positionConfiguration: function(configuration) {
                configuration.set(this.getConfigurationPosition(configuration), PREVENT_VALIDATION_OPTIONS);
            },

            getConfigurationPosition: function(configuration, printArea, printType) {

                if (!configuration) {
                    throw new Error('No configuration argument.');
                }

                printArea = printArea || configuration.$.printArea;
                printType = printType || configuration.$.printType;

                var printAreaWidth = printArea.get("boundary.size.width"),
                    printAreaHeight = printArea.get("boundary.size.height"),
                    printTypeWidth = printType.get('size.width'),
                    printTypeHeight = printType.get('size.height'),
                    maxHeight = Math.min(printAreaHeight, printTypeHeight),
                    maxWidth = Math.min(printAreaWidth, printTypeWidth),
                    defaultBox = printArea.$.defaultBox || {
                            x: 0,
                            y: 0,
                            width: printAreaWidth,
                            height: printAreaHeight
                        },
                    boundingBox,
                    defaultBoxCenterX = defaultBox.x + defaultBox.width / 2,
                    defaultBoxCenterY = defaultBox.y + defaultBox.height / 2,
                    offset = configuration.$.offset.clone(),
                    scale = Math.min(configuration.$.scale.x, configuration.$.scale.y);

                var isTextConfiguration = configuration instanceof TextConfiguration;
                boundingBox = configuration._getBoundingBox(undefined, undefined, undefined,  undefined, undefined, isTextConfiguration);
                //boundingBox = configuration._getBoundingBox();
                var centeredOffset = this.centerAt(defaultBoxCenterX, defaultBoxCenterY, boundingBox);
                offset.set({
                    x: centeredOffset.x,
                    y: defaultBox.y
                });


                // scale to fit into default box
                var scaleToFitDefaultBox = isTextConfiguration ? 1 : Math.min(defaultBox.width / boundingBox.width, defaultBox.height / boundingBox.height);

                var minimumDesignScale;

                if (configuration instanceof DesignConfiguration && printType.isEnlargeable()) {
                    minimumDesignScale = (configuration.get("design.restrictions.minimumScale") || 100) / 100;
                } else if (isTextConfiguration && printType.isEnlargeable()) {
                    minimumDesignScale = configuration._getMinimalScale(printType);
                }

                var maxPrintTypeScale = scale * (maxWidth / boundingBox.width);

                if (configuration instanceof SpecialTextConfiguration || (configuration instanceof DesignConfiguration && !configuration.$.design.isVectorDesign())) {
                    maxPrintTypeScale = 1;
                }

                scale = this.clamp(scaleToFitDefaultBox, minimumDesignScale || 0, maxPrintTypeScale);


                boundingBox = configuration._getBoundingBox(offset, null, null, null, scale);
                centeredOffset = this.centerAt(defaultBoxCenterX, defaultBoxCenterY, boundingBox);
                // position centered within defaultBox
                offset.set('x', centeredOffset.x);

                var scaleToFitWidth,
                    scaleToFitHeight;

                if (offset.$.x < 0 || offset.$.x + boundingBox.width > printAreaWidth) {
                    // hard boundary error
                    var maxPossibleWidthToHardBoundary = Math.min(defaultBoxCenterX, printAreaWidth - defaultBoxCenterX) * 2;

                    // scale to avoid hard boundary error
                    scaleToFitWidth = maxPossibleWidthToHardBoundary / boundingBox.width;
                    scale = scale * scaleToFitWidth;
                    boundingBox = configuration._getBoundingBox(offset, null, null, null, scale);
                    centeredOffset = this.centerAt(defaultBoxCenterX, defaultBoxCenterY, boundingBox);
                    // position centered within defaultBox
                    offset.set('x', centeredOffset.x);
                }

                if (boundingBox.height > maxHeight) {
                    // y-scale needed to fit print area
                    // calculate maxScale to fix height
                    scaleToFitHeight = maxHeight / boundingBox.height;

                    // TODO: try the two different scales, prefer defaultBox and fallback to printArea if size to small
                    scale = scale * scaleToFitHeight;

                    boundingBox = configuration._getBoundingBox(offset, null, null, null, scale);
                    centeredOffset = this.centerAt(defaultBoxCenterX, defaultBoxCenterY, boundingBox);
                    // position centered within defaultBox
                    offset.set(centeredOffset);
                }

                if (offset.$.y < 0 || offset.$.y + boundingBox.height > maxHeight) {
                    // hard boundary error

                    // center in print area

                    offset.set({
                        y: maxHeight / 2 - boundingBox.height / 2
                    });
                }

                // configuration.set({
                //     offset: offset
                // }, PREVENT_VALIDATION_OPTIONS);
                return {
                    offset: offset,
                    scale: {
                        x: scale,
                        y: scale
                    }
                }
            },

            convertTextToSpecialText: function(product, textConfiguration, params, callback) {
                params = params || {};
                var offset = textConfiguration.$.offset.clone();
                var width = textConfiguration.width();
                _.defaults(params, {
                    addToProduct: true,
                    removeConfiguration: true,
                    text: textConfiguration.$.textFlow.text(0, -1, "\n").replace(/\n$/, "")
                });
                var self = this;
                this.addSpecialText(product, params, function(err, config) {

                    if (err) {
                        callback && callback(err);
                    } else {
                        params.removeConfiguration && product.$.configurations.remove(textConfiguration);
                        var s = width / config.width(1);
                        config.set({
                            'scale': {
                                x: s,
                                y: s
                            }, 'offset': offset,
                            rotation: textConfiguration.$.rotation,
                            originalConfiguration: textConfiguration
                        }, {
                            force: true
                        });

                        config.set("_size", config.$._size, {force: true});
                        config.set("isNew", textConfiguration.$.isNew);

                        callback && callback(err, config);

                        self.$.bus.trigger('Application.productChanged', product);
                    }


                });
            },

            convertTextToBendingText: function(product, textConfiguration, params, callback) {
                params = params || {};
                var offset = textConfiguration.$.offset.clone();
                var width = textConfiguration.width();
                _.defaults(params, {
                    addToProduct: true,
                    removeConfiguration: true,
                    text: textConfiguration.$.textFlow.text(0, -1, "\n").replace(/\n$/, "")
                });
                var self = this;
                this.addBendingText(product, params, function(err, config) {
                    if (err) {
                        callback && callback(err);
                    } else {
                        params.removeConfiguration && product.$.configurations.remove(textConfiguration);
                        var s = width / config.width(1);
                        config.set({
                            'scale': {
                                x: s,
                                y: s
                            }, 'offset': offset,
                            rotation: textConfiguration.$.rotation,
                            originalConfiguration: textConfiguration
                        });

                        config.set("_size", config.$._size, {force: true});
                        config.set("isNew", textConfiguration.$.isNew);

                        callback && callback(err, config);

                        self.$.bus.trigger('Application.productChanged', product);
                    }

                });
            },

            convertSpecialTextToText: function(product, specialTextConfiguration, params, callback) {
                params = params || {};
                var offset = specialTextConfiguration.$.offset.clone();
                var width = specialTextConfiguration.width();
                _.defaults(params, {
                    isNew: false,
                    addToProduct: true,
                    removeConfiguration: true,
                    text: (specialTextConfiguration.$.text || "").replace(/^\n+|\n+$/gi, "")
                });
                var self = this;
                this.addText(product, params, function(err, config) {

                    if (err) {
                        callback && callback(err);
                    } else {

                        params.removeConfiguration && product.$.configurations.remove(specialTextConfiguration);
                        var s = width / config.width();
                        config.set({
                            'scale': {
                                x: s,
                                y: s
                            }, 'offset': offset,
                            rotation: specialTextConfiguration.$.rotation,
                            isNew: specialTextConfiguration.$.isNew,
                            originalConfiguration: specialTextConfiguration
                        });

                        callback && callback(err, config);

                        self.$.bus.trigger('Application.productChanged', product);
                    }
                });
            },

            convertBendingTextToText: function(product, bendingTextConfiguration, params, callback) {
                params = params || {};
                var offset = bendingTextConfiguration.$.offset.clone();
                var width = bendingTextConfiguration.width();
                _.defaults(params, {
                    isNew: false,
                    addToProduct: true,
                    removeConfiguration: true,
                    text: (bendingTextConfiguration.$.text || "").replace(/^\n+|\n+$/gi, "")
                });
                var self = this;
                this.addText(product, params, function(err, config) {

                    if (err) {
                        callback && callback(err);
                    } else {

                        params.removeConfiguration && product.$.configurations.remove(bendingTextConfiguration);
                        var s = width / config.width();
                        config.set({
                            'scale': {
                                x: s,
                                y: s
                            }, 'offset': offset,
                            rotation: bendingTextConfiguration.$.rotation,
                            isNew: bendingTextConfiguration.$.isNew,
                            originalConfiguration: bendingTextConfiguration
                        });

                        callback && callback(err, config);

                        self.$.bus.trigger('Application.productChanged', product);
                    }
                });
            },


            checkConfigurationOffset: function(product, configuration) {

                if (this._checkConfigurationOutsideViewPort(product, configuration)) {
                    // configuration has been removed
                    return;
                }

                this._checkConfigurationOutsideSoftBoundedPrintArea(product, configuration);

            },

            _checkConfigurationOutsideSoftBoundedPrintArea: function(product, configuration) {

                if (!(product && configuration)) {
                    return;
                }

                // check if the configuration is complete outside the print area, if so remove it
                var boundingBox = configuration._getBoundingBox(),
                    printArea = configuration.$.printArea;

                if (boundingBox && printArea && printArea.hasSoftBoundary() &&
                    (
                        boundingBox.x > printArea.width() ||
                        boundingBox.x + boundingBox.width < 0 ||
                        boundingBox.y > printArea.height() ||
                        boundingBox.y + boundingBox.height < 0
                    )) {

                    product.$.configurations.remove(configuration);
                    return true;
                }

                return false;

            },

            _checkConfigurationOutsideViewPort: function(product, configuration) {

                if (!this.$.removeConfigurationOutsideViewPort) {
                    return;
                }

                if (!(configuration && product)) {
                    return;
                }

                // check if the configuration is complete outside the print area, if so remove it
                var boundingBox = configuration._getBoundingBox(),
                    printArea = configuration.$.printArea;


                if (!(printArea && boundingBox)) {
                    return;
                }

                if (printArea.hasSoftBoundary()) {
                    // don't remove for soft boundaries
                    return;
                }

                // find default view for print area
                var view;

                if (this.$.view && this.$.view.containsPrintArea(printArea)) {
                    // use current view of the product
                    view = this.$.view;
                }

                if (!view) {
                    // use the default view
                    view = printArea.getDefaultView();
                }

                if (!view) {
                    return;
                }

                var viewMap = view.getViewMapForPrintArea(printArea);

                if (!viewMap) {
                    return;
                }

                var right = view.get("size.width"),
                    bottom = view.get("size.height"),
                    middlePoint = {
                        x: boundingBox.x + boundingBox.width / 2 + viewMap.get("offset.x"),
                        y: boundingBox.y + boundingBox.height / 2 + viewMap.get("offset.y")
                    };

                if (middlePoint.x < 0 || middlePoint.y < 0 || middlePoint.x > right || middlePoint.y > bottom) {
                    // outside the view
                    //product.$.configurations.remove(configuration);
                    this._moveConfigurationToView(product, configuration);
                    return true;
                }

                return false;

            }


        });

    });