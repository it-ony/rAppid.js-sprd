define(["sprd/entity/DesignConfigurationBase", "sprd/entity/Size", "sprd/entity/Font", "sprd/util/ProductUtil", "sprd/entity/BlobImage", "sprd/data/IImageUploadService", "flow", 'js/core/Bus', "underscore", "sprd/util/ArrayUtil", "sprd/extensions/CanvasToBlob"
        , "xaml!sprd/data/DesignerApiDataSource", "sprd/model/Transformer", "sprd/model/AbstractShop", "sprd/entity/TextConfiguration", "xaml!sprd/view/svg/BendingTextConfigurationUploadRenderer", "xaml!sprd/view/svg/BendingTextConfigurationMeasureRenderer"],
    function(DesignConfigurationBase, Size, Font, ProductUtil, BlobImage, IImageUploadService, flow, Bus, _, ArrayUtil, CanvasToBlob, DesignerApiDataSource, Transformer, Shop, TextConfiguration, BendingTextConfigurationUploadRenderer, BendingTextConfigurationMeasureRenderer) {
        var PATH_TYPE = {
            OUTER_CIRCLE: "outer_circle",
            INNER_CIRCLE: "inner_circle",
            HEART: "heart"
        };

        var designCache = {},
            copyrightWordList = TextConfiguration.getCopyrightWordList();

        return DesignConfigurationBase.inherit('sprd.model.BendingTextConfiguration', {

            defaults: {
                fontSize: 16,

                _size: Size,
                aspectRatio: 1,
                _allowScale: true,
                loading: false,
                initialized: false,
                isNew: false,
                isTemplate: false,

                angle: 50,
                path: PATH_TYPE.OUTER_CIRCLE,
                textPath: "{textPath()}",
                dy: "{dy()}",

                textPathOffsetX: 0,
                textPathOffsetY: 0,
                transformer: null,
                copyrightWordList: null,
                initialText: null,
                measurer: null
            },

            type: "bendingText",
            representationType: "text",

            $events: [
                "recalculateSize"
            ],

            inject: {
                imageUploadService: IImageUploadService,
                designerApi: DesignerApiDataSource,
                bus: Bus,
                context: "context"
            },

            ctor: function() {
                this.callBase();

                copyrightWordList.bind("add", function() {
                    this._validateText();
                }, this);

                this.$synchronizeCache = designCache;
            },

            init: function(options, callback) {
                var properties = this.$.properties,
                    context = this.$.context,
                    self = this;
                options = options || {};

                this.initTransformer();
                this.initMeasurer();
                if (!_.isEmpty(properties)) {

                    if (this.$.initialized) {
                        callback && callback();
                        return;
                    }

                    flow()
                        .seq(function(cb) {
                            options = _.clone(options);
                            options.noDesignFetch = true;

                            DesignConfigurationBase.prototype.init.call(self, options, cb);
                        })
                        .seq(function(cb) {
                            var fontFamilies = context.$.fontFamilies;
                            if (fontFamilies.size()) {
                                cb();
                            } else {
                                fontFamilies.fetch({fullData: true}, cb);
                            }
                        })
                        .seq("fontFamily", function() {
                            var fontFamilyId = properties.fontFamilyId;
                            if (fontFamilyId) {
                                var items = context.$.fontFamilies.$items;

                                for (var i = items.length; i--;) {
                                    if (items[i].$.id == properties.fontFamilyId) {
                                        return items[i];
                                    }
                                }
                            }
                        })
                        .seq(function() {
                            var printType = self.$.printType;
                            if (printType && properties.fill) {
                                self.setColor(null, printType.getClosestPrintColor(properties.fill))
                            }
                        })
                        .seq(function() {
                            if (properties.text) {

                                var fontFamily = this.vars.fontFamily,
                                    fontWeight = properties.fontWeight,
                                    fontStyle = properties.fontStyle;


                                var scale = {
                                    x: properties.scale,
                                    y: properties.scale
                                };

                                var size = new Size({
                                    width: (properties.size && properties.size.width) || 0,
                                    height: (properties.size && properties.size.height) || 0
                                });

                                self.set({
                                    text: properties.text,
                                    angle: properties.angle || 50,
                                    path: properties.path || PATH_TYPE.OUTER_CIRCLE,
                                    font: fontFamily.getFont(fontWeight, fontStyle),
                                    fontSize: properties.fontSize || 16,
                                    _size: size,
                                    scale: scale
                                })
                            }
                        })
                        .exec(function(err) {
                            self.set("initialized", true);
                            callback && callback(err);
                        });
                } else {
                    callback && callback();
                }

            },

            _commitText: function() {
                this._validateText();
            },

            initTransformer: function() {
                var shop = this.$.designerApi.createEntity(Shop, this.$.context.$.id);
                this.set('transformer', shop.createEntity(Transformer));
            },

            size: function() {
                return this.$._size || Size.empty;
            }.onChange("_size").on("sizeChanged"),

            compose: function() {
                var ret = this.callBase();
                var font = this.$.font;
                ret.properties.type = "bendingText";
                ret.properties.text = this.$.text;
                ret.properties.angle = this.$.angle;
                ret.properties.fontFamilyId = font.getFontFamily().$.id;
                ret.properties.fontWeight = font.$.weight;
                ret.properties.fontStyle = font.$.style;
                ret.properties.fontSize = this.$.fontSize;
                if (!this.$.printColors.isEmpty()) {
                    ret.properties.fill = this.$.printColors.at(0).toHexString();
                    var printColor = this.$.printColors.at(0);
                    var convertedPrintColor = this.$.printType.getClosestPrintColor(printColor.color());
                    ret.content.svg.image.printColorIds = ret.content.svg.image.printColorIds || "" + convertedPrintColor.$.id;
                }
                
                ret.properties.path = this.$.path;
                ret.properties.scale = this.$.scale.x;
                ret.properties.size = this.$._size.$;

                return ret;
            },

            _initializationComplete: function() {
                this.callBase();

                var recalculateSize = function() {
                    var self = this;
                    self.trigger("recalculateSize", self);
                    this.trigger('configurationChanged');
                };

                this.bind("change:text", recalculateSize, this);
                this.bind("change:angle", recalculateSize, this);
                this.bind("change:font", recalculateSize, this);
                this.bind("change:fontSize", recalculateSize, this);

                this.bind("change:printColors", function() {
                    this.trigger('configurationChanged');
                }, this)
            },

            _preDestroy: function () {
                this.removeMeasurer();
            },

            minimumScale: function () {
                var minScale = this.callBase() || Number.MIN_VALUE;
                var font = this.$.font,
                    fontSize = this.$.fontSize;

                if (font && font.$.minimalSize && fontSize) {
                    minScale = Math.max(font.$.minimalSize / fontSize, minScale);
                }

                return minScale;
            }.onChange('printType', 'font', 'fontSize'),


            textPath: function() {
                var a = this.$.angle;

                this.set("path", PATH_TYPE.OUTER_CIRCLE);
                if (a < 0) {
                    a = -a;

                    return "M 0, 0 m oneTime, twoTime a oneTime, oneTime 0 1, 0 0, twoTime a oneTime, oneTime 0 1, 0 0, -twoTime"
                        .replace(/oneTime/g, "" + a)
                        .replace(/twoTime/g, "" + (2 * a));

                } else {
                    return "M 0, 0 m oneTime, 0 a oneTime, oneTime 0 1, 1 0, -twoTime a oneTime, oneTime 0 1, 1 0, twoTime"
                        .replace(/oneTime/g, "" + a)
                        .replace(/twoTime/g, "" + (2 * a));
                }


            }.on("recalculateSize"),

            dy: function() {
                return this.$.angle < 0 ? 16 : 0;
            }.onChange("angle"),

            getPossiblePrintTypes: function(appearance) {
                var ret = [],
                    tmp,
                    printArea = this.$.printArea,
                    font = this.$.font;

                if (!printArea || !font) {
                    return ret;
                }

                if (this.$context) {
                    appearance = appearance || this.$context.$contextModel.get('appearance');
                }

                tmp = this.getPossiblePrintTypesForPrintArea(printArea, appearance);
                _.each(tmp, function(element) {
                    if (ret.indexOf(element) === -1) {
                        ret.push(element);
                    }
                });

                return ret;
            }.onChange("printArea", "font"),

            setColor: function(layerIndex, color) {
                var printColors = this.$.printColors;
                if (printColors && color) {
                    printColors.reset([color]);
                }
            },

            getPossiblePrintTypesForPrintArea: function(printArea, appearance) {
                var fontFamily = this.$.font.getFontFamily(),
                    text = this.$.text;

                if (text) {
                    var possiblePrintTypes = ProductUtil.getPossiblePrintTypesForTextOnPrintArea(fontFamily, printArea, appearance),
                        digitalPrintTypes = _.filter(possiblePrintTypes, function(printType) {
                            return !printType.isPrintColorColorSpace();
                        });
                    return ArrayUtil.moveToStart(possiblePrintTypes, digitalPrintTypes);
                }
            },

            save: function(callback) {
                var self = this,
                    digitalPrint = !this.$.printType.isPrintColorColorSpace();

                var cacheId = [self.$.angle, self.$.text, self.$.font.$.id, self.$.fontSize, self.$.printType.$.id];
                var fill = self.$.printColors.at(0).toHexString();

                if (digitalPrint) {
                    cacheId.push(fill);
                }

                cacheId = cacheId.join("-");


                this.synchronizeFunctionCall(function(callback) {

                    flow()
                        .seq('design', function(cb) {
                            self.transformTextPath(cb);
                        })
                        .exec(function(err, results) {
                            callback(err, results.design);
                        });

                }, cacheId, function(err, design) {
                    self.set('design', design);
                    callback(err);
                }, this);

            },

            getPrintColor: function() {
                var configuration = this,
                    printColors = configuration.$.printColors,
                    printColor = null;

                if (printColors && printColors.size()) {
                    printColor = printColors.at(0).toHexString();
                }

                return printColor;
            }.on("printColors"),

            initMeasurer: function () {
                if (this.$.measurer) {
                    return;
                }

                if (this.$stageRendered || (this.$stage && this.$stage.rendered)) {
                    var measureRenderer = this.$stage.createComponent(BendingTextConfigurationMeasureRenderer, {
                        configuration: this,
                        maskId: this.$cid,
                    });
                    this.set('measurer', measureRenderer);
                    this.$stage.addChild(measureRenderer);
                    measureRenderer.setInnerRect();
                }
            },

            removeMeasurer: function () {
                if (!this.$.measurer) {
                    return;
                }
                var measurer = this.$.measurer,
                    el = measurer.$el,
                    parent = el.parentNode;

                if (parent) {
                    parent.removeChild(el);
                }

                this.set('measurer', null);
            },

            transformTextPath: function(callback) {
                var self = this;
                try {
                    var uploadRenderer = this.$stage.createComponent(BendingTextConfigurationUploadRenderer, {
                        configuration: this
                    });
                    this.$stage.addChild(uploadRenderer);
                    var svgContent = uploadRenderer.getElementAsString();
                } catch (e) {
                    callback(e, null);
                } finally {
                    this.$stage.removeChild(uploadRenderer);
                }

                var transformer = this.$.transformer;

                transformer.set('content', svgContent);
                transformer.save(null, function(err, transformer) {
                    if (err) {
                        return callback(err, transformer);
                    }

                    var upload = transformer.get("content");

                    var designId = (upload.designId || "").replace(/^u?/, "u"),
                        design = self.$.context.getCollection("designs").createItem(designId);

                    design.fetch(function(err) {
                        callback(err, design);
                    });
                })
            },

            saveTakesTime: function() {
                return true;
            },

            isAllowedOnPrintArea: function(printArea) {
                return printArea && printArea.get("restrictions.textAllowed") == true;
            },

            _additionalValidation: function($, options) {
                if (this._hasSome($, ["angle", "text", "fontSize"])) {
                    return {
                        angle: $.angle,
                        text: $.text,
                        validateHardBoundary: true
                    };
                }
            },

            _validateText: function() {
                var text = (this.$.text || "").toLowerCase(),
                    badWord;

                if (text.length > 1) {
                    // check that we don't contain copyright content
                    if (copyrightWordList && copyrightWordList.size()) {
                        badWord = copyrightWordList.find(function(word) {
                            return text.indexOf(word.toLowerCase()) !== -1;
                        });

                        this._setError("copyright", badWord);
                    }
                }
            },

            clone: function (options) {
                options = options || {};
                options.exclude = options.exclude || [];

                options.exclude.push("measurer");

                return this.callBase(options);
            },

            bus_StageRendered: function () {
                this.$stageRendered = true;
                this.initMeasurer();
            }.bus("Stage.Rendered")
        });
    });
