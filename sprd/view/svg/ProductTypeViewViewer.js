define(['js/svg/SvgElement', "xaml!sprd/view/svg/PrintAreaViewer", "xaml!sprd/view/DndImage", "sprd/view/DndImageClass", "sprd/util/ProductUtil", "sprd/util/ViewUtil"], function(SvgElement, PrintAreaViewer, DndImage, DndImageClass, ProductUtil, ViewUtil) {


    var dndObject = null,
        productTypeViewViewer = [],
        DROP_HOVERED = DndImageClass.DROP_HOVERED;

    function findProductTypeViewViewer (x, y, requestor) {
        var ret = null;
        for (var i = 0; i < productTypeViewViewer.length; i++) {
            var viewer = productTypeViewViewer[i];
            if (viewer !== requestor && viewer.isPointInElement(x, y)) {
                return viewer;
            }
        }

        return ret;

    }

    return SvgElement.inherit('sprd.view.svg.ProductTypeViewViewer', {

        defaults: {
            tagName: "g",
            componentClass: "product-type-view",

            product: null,

            productViewer: null,

            _width: "{productViewer.width}",
            _height: "{productViewer.height}",
            _appearance: "{product.appearance}",


            _view: null,
            _productType: null,

            imageService: null
        },

        $classAttributes: ["productViewer", "product", "imageService"],

        ctor: function() {
            this.$printAreas = [];

            this.callBase();

            this.bind("productViewer", "change:zoomToPrintArea", function() {
                this.zoomToPrintArea();
            }, this);

            productTypeViewViewer.push(this);
        },

        url: function() {
            if (this.$.imageService && this.$._productType && this.$._view && this.$._productType.containsAppearance(this.$._appearance)) {
                var width = this.$._width * (this.$.scaleX || 1);
                var height = this.$._height * (this.$.scaleY || 1);
                return this.$.imageService.productTypeImage(this.$._productType.$.id, this.$._view.$.id, this.$._appearance.$.id, {
                    width: Math.max(width, height),
                    height: Math.max(width, height)
                });
            }

            return "";
        }.onChange("_width", "_height", "_appearance", "scaleX", "scaleY"),


        isPointInElement: function(x, y) {

            if (this.$el) {
                var clientRect = this.$el.getBoundingClientRect();
                return clientRect.left < x && clientRect.right > x && clientRect.top < y && clientRect.bottom > y;
            }
            return false;

        },

        /**
         * Returns true if point is inside element (hover)
         * @param x
         * @param y
         * @returns {Boolean}
         */
        checkForDropHover: function(x, y) {
            return this.isPointInElement(x, y);
        },


        _initializeRenderer: function() {

            var width = this.get("_view.size.width");
            var height = this.get("_view.size.height");

            if (width < 0 || height < 0) {
                width = height = 500;
            }

            this.$productTypeImage = this.createComponent(SvgElement, {
                tagName: "image",
                href: "{url()}",
                x: 0,
                y: 0,
                width: width,
                height: height
            });

            this.addChild(this.$productTypeImage);

            this.$dndImage = this.createComponent(DndImage, {
                visible: false
            });
            this.$stage.addChild(this.$dndImage);

            this.callBase();

        },

        _removePrintAreas: function() {
            for (var i = 0; i < this.$printAreas.length; i++) {
                var printArea = this.$printAreas[i];
                printArea.remove();
                printArea.destroy();
            }

            this.$printAreas = [];
        },

        _handleIn: function(e) {
            var self = this;
            if (dndObject) {
                var configViewer = dndObject.configurationViewer,
                    productManager = dndObject.viewer.get('product.manager');

                if (configViewer && configViewer.$._mode == "move") {
                    if (dndObject && dndObject.dndImage) {
                        var hovered = DROP_HOVERED.NO;

                        var configuration = configViewer.$.configuration;
                        // Check if there is a hover with a view unequal current one

                        if (dndObject.viewer === self) {
                            return;
                        }

                        var printArea = self.$printAreas[0].getPrintArea();
                        var possiblePrintTypes;
                        // Check printArea constraints
                        var appearance = this.get('_appearance');
                        if (configuration.$.design) {
                            possiblePrintTypes = ProductUtil.getPossiblePrintTypesForDesignOnPrintArea(configuration.$.design, printArea, appearance);
                        } else {
                            possiblePrintTypes = configuration.getPossiblePrintTypesForPrintArea(printArea, appearance);
                        }
                        if (possiblePrintTypes.length) {
                            var product = dndObject.viewer.$.product;
                            var validatedMove = productManager.validateMove(possiblePrintTypes, printArea, configuration, product);

                            if (!validatedMove) {
                                hovered = DROP_HOVERED.INVALID;
                            } else {
                                hovered = DROP_HOVERED.YES;
                            }
                        } else {
                            hovered = DROP_HOVERED.INVALID;
                        }
                    }
                    dndObject.dndImage.set('hoverState', hovered);
                }
            }
        },

        _handleOut: function(e) {
            if (dndObject) {
                dndObject.dndImage.set('hoverState', DROP_HOVERED.NO);
            }
        },

        _bindDomEvents: function() {
            this.callBase();
            this.bind('on:pointerup', this._handleUp, this);
            this.bind('on:pointerdown', this._handleDown, this);
            this.bind('on:mouseover', this._handleIn, this);
            this.bind('on:mouseout', this._handleOut, this);
        },

        bindMoveEvent: function() {
            var self = this;
            if (!this.$moveHandler) {
                this.$moveHandler = function(e) {
                    if (dndObject) {
                        var clientRect = dndObject.boundingRect,
                            configViewer = dndObject.configurationViewer,
                            pointerEvent = e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e,
                            x = pointerEvent.clientX,
                            y = pointerEvent.clientY;

                        if (configViewer && configViewer.$._mode == "move") {

                            if (clientRect.left > x || clientRect.right < x || clientRect.top > y || clientRect.bottom < y) {
                                if (configViewer) {
                                    configViewer.$.configuration.clearErrors();
                                    configViewer.disableMoveSnipping();
                                    configViewer.set('preventValidation', true);
                                    configViewer.addClass('hide-configuration');
                                    dndObject.dndImage.set({
                                        'visible': true,
                                        'left': x,
                                        'top': y
                                    });
                                }
                            } else {
                                if (configViewer) {
                                    configViewer.set('preventValidation', false);
                                    configViewer.removeClass('hide-configuration');
                                    configViewer.enableMoveSnipping();
                                }

                                dndObject.dndImage.set({
                                    'visible': false
                                });

                            }
                        }
                    }
                }
            }
            if (!this.$upHandler) {
                this.$upHandler = function(e) {
                    self._handleUp({
                        domEvent: e
                    });
                };
            }
            this.dom(this.$stage.$window).bindDomEvent('pointerup', this.$upHandler);
            this.dom(this.$stage.$window).bindDomEvent('pointermove', this.$moveHandler);
        },
        unbindMoveEvent: function() {
            if (this.$moveHandler) {
                this.dom(this.$stage.$window).unbindDomEvent('pointermove', this.$moveHandler);
            }
            if (this.$upHandler) {
                this.dom(this.$stage.$window).unbindDomEvent('pointerup', this.$upHandler);
            }
        },
        _handleUp: function(e) {
            var domEvent = e.domEvent;
            if (dndObject) {
                var viewer = this,
                    productManager = dndObject.viewer.get('product.manager'),
                    hoverState = dndObject.dndImage.get('hoverState');

                dndObject.viewer.unbindMoveEvent();

                if (domEvent.changedTouches && domEvent.changedTouches.length) {
                    viewer = findProductTypeViewViewer(domEvent.changedTouches[0].clientX, domEvent.changedTouches[0].clientY, viewer);
                }

                var configView = dndObject.configurationViewer;
                var product = dndObject.viewer.$.product;

                if (viewer && dndObject.viewer !== viewer) {
                    e.stopPropagation && e.stopPropagation();
                    configView.$moving = false;
                    dndObject.dndImage.set('hoverState', DROP_HOVERED.NO);

                    productManager.moveConfigurationToView(product, dndObject.config, viewer.$._view, {respectTransform: true}, function(err) {
                        if (!err) {
                            dndObject.viewer.$.product.set('view', viewer.$._view);
                        }
                    });
                    configView && configView.set('preventValidation', false);
                }

                if (configView && configView.$el) {
                    configView.removeClass('hide-configuration');
                    configView.enableMoveSnipping();
                }
                
                dndObject.dndImage.set({
                    'visible': false
                });
                dndObject = null;
            }
        },


        _handleDown: function() {
            var productViewer = this.$.productViewer,
                selectedConfiguration = productViewer.$.selectedConfiguration;
            if (selectedConfiguration && this.$printAreas.length && !dndObject) {
                var target = this.$printAreas[0],
                    configViewer = this.getViewerForConfiguration(selectedConfiguration);

                if (selectedConfiguration.$.design) {
                    flow()
                        .seq(function(cb) {
                            selectedConfiguration.$.design.fetch(null, cb);
                        })
                        .exec();
                }

                this.$dndImage.set('configurationViewer', configViewer, {force: true});

                dndObject = {
                    boundingRect: target.getStaticBoundingRect(),
                    config: selectedConfiguration,
                    configurationViewer: this.getViewerForConfiguration(selectedConfiguration),
                    viewer: this,
                    dndImage: this.$dndImage
                };
                this.bindMoveEvent();
            }
        },

        _render_view: function(view) {

            this._removePrintAreas();

            if (view) {

                for (var i = 0; i < view.$.viewMaps.$items.length; i++) {
                    var viewMap = view.$.viewMaps.$items[i];

                    var printAreaViewer = this.createComponent(PrintAreaViewer, {
                        product: this.$.product,
                        productTypeViewViewer: this,
                        productViewer: this.$.productViewer,

                        _viewMap: viewMap,

                        imageService: this.$.imageService
                    });

                    this.addChild(printAreaViewer);
                    this.$printAreas.push(printAreaViewer);
                }

                this.zoomToPrintArea();
            }
        },

        zoomToPrintArea: function() {

            var zoomToPrintArea = this.get("productViewer.zoomToPrintArea");
            var maxZoom = this.get("productViewer.maxZoom");
            var view = this.get('_view');

            if (!(zoomToPrintArea && view)) {
                this.set({
                    scaleX: 1,
                    scaleY: 1,
                    translateX: 0,
                    translateY: 0
                });
                return;
            }

            var surroundingRect = ViewUtil.surroundingRectOfViewMapsInView(view);
            var viewWidth = view.get('size.width');
            var viewHeight = view.get('size.height');
            var minScaleFactor = Math.min(viewWidth / surroundingRect.width, viewHeight / surroundingRect.height) - 1;
            var scale = 1 + Math.min(minScaleFactor * zoomToPrintArea, maxZoom);

            this.set({
                scaleX: scale,
                scaleY: scale,
                translateX: viewWidth / 2 - scale * (surroundingRect.x + surroundingRect.width / 2),
                translateY: viewHeight / 2 - scale * (surroundingRect.y + surroundingRect.height / 2)
            });

        },

        getViewerForConfiguration: function(configuration) {
            var viewer;
            for (var i = 0; i < this.$printAreas.length; i++) {
                viewer = this.$printAreas[i].getViewerForConfiguration(configuration);
                if (viewer) {
                    return viewer;
                }
            }
            return null;
        },

        _commitProduct: function(product) {
            for (var i = 0; i < this.$printAreas.length; i++) {
                this.$printAreas[i].set('product', product);
            }
        },

        destroy: function() {

            this._removePrintAreas();
            this.callBase();
        }

    })
        ;
})
;