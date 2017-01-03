define(["sprd/model/Mask", "flow", "rAppid"], function(Mask, flow, rappid) {

    return Mask.inherit("sketchomat.model.VectorMask", {

            defaults: {
                vector: null,
                svg: null,
                fixedAspectRatio: '{fixedAspectRatio()}'
            },

        _commitFixedAspectRatio: function(fixedAspectRatio) {
            this.set('scale.fixedAspectRatio', fixedAspectRatio);
            this.set('maxScale.fixedAspectRatio', fixedAspectRatio);
        },

            initImage: function(callback) {
                if (!this.get('vector')) {
                    return callback && callback(null, null);
                }

                if (this.get('htmlImage')) {
                    return callback && callback(null, this.get('htmlImage'));
                }

                var self = this;

                flow()
                    .seq('data_uri', function(cb) {
                        self.getSvgDataUri(self.get('vector'), cb);
                    })
                    .seq('img', function(cb) {
                        var img = new Image();

                        img.onload = function() {
                            self.set('htmlImage', img);
                            cb && cb(null, img);
                        };

                        img.onerror = function(e) {
                            cb && cb(e);
                        };

                        img.src = this.vars.data_uri;
                    })
                    .exec(function(err, results) {
                        callback && callback(err, results.img);
                    });
            },

            getSvgDataUri: function(url, callback) {
                var self = this;
                rappid.ajax(url, {'Content-Type': "image/svg+xml"}, function(err, xhr) {
                    if (err) {
                        callback && callback(err, xhr);
                        return;
                    }

                    if (xhr.status == 200) {
                        self.set('svg', xhr.responses.xml);
                        var data_uri = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xhr.responses.text)));
                        callback && callback(null, data_uri);
                    } else {
                        callback && callback(new Error("Request was not successful for Vectormask with id " + self.$.id + " and name " + self.$.name), xhr);
                    }
                });
            },

        previewUrl: function() {
            var url = this.callBase();
            return url || this.$.vector;
        }.onChange('image', 'preview'),

        fixedAspectRatio: function() {
            var svg = this.$.svg;
            if (svg) {
                return svg.documentElement.getAttribute('preserveAspectRatio') != 'none';
            }

            return false;
        }.onChange('svg')
        }
    );
});