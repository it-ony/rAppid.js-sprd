define(['js/data/Entity', 'js/type/Color'], function(Entity, Color) {
    return Entity.inherit('sprd.entity.AppearanceColor', {
        schema: {
            index: Number,
            value: String
        },

        defaults: {
            /***
             * the appearance to represent
             * @type sprd.entity.Appearance
             */
            appearance: null
        },

        parse: function(data) {
            data = this.callBase();
            data.value = Color.parse(data.value);
            return data;
        },

        color: function() {
            return this.$.value;
        }
    })
});