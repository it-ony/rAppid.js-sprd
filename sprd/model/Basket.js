define(["sprd/data/SprdModel", "js/core/List", "sprd/model/BasketItem"], function (SprdModel, List, BasketItem) {
    return SprdModel.inherit("sprd.model.Basket",{
        ctor: function(attributes){
            this.callBase();
            this.set('basketItems',this.$.basketItems || new List());
        },

        addConcreteArticle: function(concreteArticle, quantity){
            var basketItem = this.getBasketItemForConcreteArticle(concreteArticle);
            if(basketItem){
                basketItem.increaseQuantity(quantity);
            }else{
                basketItem = new BasketItem({concreteArticle: concreteArticle});
                basketItem.bind('change:quantity', this._onItemQuantityChange, this);
                concreteArticle.bind('change:size', this._onArticleSizeChange, this);
                this.$.basketItems.add(basketItem);
            }
        },
        _onItemQuantityChange: function(e,model){
            if(model.$.quantity < 1){
                this.$.basketItems.remove(model);
            }
        },
        _onArticleSizeChange: function(e,model){
            var old, nItem;
            this.$.basketItems.each(function(item){
               if(!nItem && item.$.concreteArticle !== model && item.$.concreteArticle.isEqual(model)){
                   nItem = item;
               }
            });
            if(nItem){
                this.$.basketItems.each(function (item) {
                    if (!old && item.$.concreteArticle === model) {
                        old = item;
                    }
                });
                nItem.increaseQuantity(old.$.quantity);
                this.$.basketItems.remove(old);
            }

        },
        getBasketItemForConcreteArticle : function(concreteAricle){
            for (var i = 0; i < this.$.basketItems.$items.length; i++) {
                var basketItem = this.$.basketItems.$items[i];
                if(basketItem.$.concreteArticle.isEqual(concreteAricle)){
                    return basketItem;
                }
            }
            return null;
        },
        _bindList: function(newList, oldList){
            if(oldList){
               oldList.unbind('change', this._triggerFunctions, this);
               oldList.unbind('add', this._triggerFunctions, this);
               oldList.unbind('remove', this._triggerFunctions, this);
            }

            if(newList){
                newList.bind('change', this._triggerFunctions, this);
                newList.bind('add', this._triggerFunctions, this);
                newList.bind('remove', this._triggerFunctions, this);
            }
        },
        _triggerFunctions: function() {
            this.trigger('change',{});
        },
        _commitChangedAttributes: function(attributes){
            this.callBase();

            if(attributes.basketItems){
                this._bindList(attributes.basketItems,this.$previousAttributes['basketItems']);
            }
        },
        totalItemsCount: function () {
            var total = 0;
            this.$.basketItems.each(function(item){
                total += item.$.quantity;
            });
            return total;
        }.on('change'),
        vatIncluded: function(){
            var total = 0;
            this.$.basketItems.each(function(item){
                total += item.vatIncluded();
            });
            return total;
        }.on('change'),
        vatExcluded: function () {
            var total = 0;
            this.$.basketItems.each(function (item) {
                total += item.vatExcluded();
            });
            return total;
        }.on('change')
    });
});
