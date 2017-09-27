define(["js/ui/View", "sprd/lib/ScrollIntoViewIfNeeded"], function(View, ScrollIntoViewIfNeeded) {
    return View.inherit({

        defaults: {
            scrollDelay: 0,
            duration: null
        },

        _renderSelected: function(selected) {

            this.callBase();

            if (selected) {
                var $el = this.$el,
                    self = this;
                setTimeout(function() {
                    self.$.selected && ScrollIntoViewIfNeeded($el, null, self.$.duration);
                }, this.$.scrollDelay)
            }
        }

    });
});