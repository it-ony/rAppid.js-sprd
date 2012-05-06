define(["sprd/data/SprdModel"], function (Model) {
    return Model.inherit('sprd.model.Currency', {
        formatPrice: function (val) {
            val = new String(val);
            if(val.split(".").pop().length < this.$.decimalCount){
                val += "0";
            }

            return this.$.pattern.replace('%',val).replace('$', this.$.symbol);
        }
    });

});