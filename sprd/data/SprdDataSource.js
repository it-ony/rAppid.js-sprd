define(["js/data/RestDataSource", "js/data/Model", "js/data/Collection", "underscore"], function (RestDataSource, Model, Collection, _) {

    var SprdDataSource = RestDataSource.inherit('sprd.data.SprdDataSource', {
        defaults: {
            apiKey: null,
            secret: null,
            session: null,
            checkoutToken: null,
            authToken: null
        },

        _getConfigurationForResource: function (resource) {

            var parentContext = resource.$context;
            var configuration = this.$dataSourceConfiguration;

            if (parentContext && parentContext.$contextModel) {
                configuration = configuration.getConfigurationForModelClass(parentContext.$contextModel.factory);
            }

            if (resource instanceof Model) {
                return configuration.getConfigurationForModelClass(resource.factory);
            } else if (resource instanceof Collection) {
                return configuration.getConfigurationForModelClass(resource.$modelFactory);
            }


            return null;
        },

        getQueryParameters: function (method, resource) {
            var obj = {};

            if (this.$.locale) {
                obj.locale = this.$.locale;
            }

            var params = _.defaults(obj, this.callBase());

            var configuration,
                apiKey = this.$.apiKey,
                needsSignature;

            // get the configuration only if needed
            configuration = this._getConfigurationForResource(resource);

            if (!configuration) {
                throw new Error("Configuration for resource not found");
            }

            var signatureRequired = configuration.$.signatureRequired,
                apiKeyRequired = configuration.$.apiKeyRequired,
                sessionRequired = configuration.$.sessionRequired,
                sessionPreferred = configuration.$.sessionPreferred,
                checkoutTokenRequired = configuration.$.checkoutTokenRequired,
                authTokenRequired = configuration.$.authTokenRequired;

            var sessionId = this.get('session.id');

            needsSignature = signatureRequired || (sessionRequired && sessionId);

            if (sessionId && (sessionRequired || sessionPreferred)) {
                params = _.defaults(params, {
                    // TODO: change session id to token for translation service
                    sessionId: sessionId
                });
            }

            if (needsSignature) {
                var secret = this.$.secret;
                var time = Date.now();
                var url = this._buildUriForResource(resource, this.$.endPoint);

                var data = method + " " + url + " " + time + " " + secret;

                params = _.defaults(params, {
                    sig: SprdDataSource.SHA1(data),
                    time: time,
                    apiKey: apiKey
                });
            }

            if (checkoutTokenRequired && this.$.checkoutToken) {
                params.token = this.$.checkoutToken;
            }

            if (authTokenRequired && this.$.authToken) {
                params.authToken = this.$.authToken;
            }

            if (apiKeyRequired || signatureRequired || sessionRequired) {
                params = _.defaults(params, {
                    apiKey: apiKey
                });
            }

            return params;
        }
    });

    SprdDataSource.SHA1 = function (msg) {

        function rotateLeft(n, s) {
            return ( n << s ) | (n >>> (32 - s));
        }

        function cvtHex(val) {
            var str = "";
            var i;
            var v;

            for (i = 7; i >= 0; i--) {
                v = (val >>> (i * 4)) & 0x0f;
                str += v.toString(16);
            }
            return str;
        }

        function utf8Encode(string) {
            string = string.replace(/\r\n/g, "\n");
            var utfText = "";

            for (var n = 0; n < string.length; n++) {

                var c = string.charCodeAt(n);

                if (c < 128) {
                    utfText += String.fromCharCode(c);
                }
                else if ((c > 127) && (c < 2048)) {
                    utfText += String.fromCharCode((c >> 6) | 192);
                    utfText += String.fromCharCode((c & 63) | 128);
                }
                else {
                    utfText += String.fromCharCode((c >> 12) | 224);
                    utfText += String.fromCharCode(((c >> 6) & 63) | 128);
                    utfText += String.fromCharCode((c & 63) | 128);
                }

            }

            return utfText;
        }

        var blockStart;
        var i, j;
        var W = new Array(80);
        var H0 = 0x67452301;
        var H1 = 0xEFCDAB89;
        var H2 = 0x98BADCFE;
        var H3 = 0x10325476;
        var H4 = 0xC3D2E1F0;
        var A, B, C, D, E;
        var temp;

        msg = utf8Encode(msg);

        var msg_len = msg.length;

        var word_array = [];
        for (i = 0; i < msg_len - 3; i += 4) {
            j = msg.charCodeAt(i) << 24 | msg.charCodeAt(i + 1) << 16 |
                msg.charCodeAt(i + 2) << 8 | msg.charCodeAt(i + 3);
            word_array.push(j);
        }

        switch (msg_len % 4) {
            case 0:
                i = 0x080000000;
                break;
            case 1:
                i = msg.charCodeAt(msg_len - 1) << 24 | 0x0800000;
                break;

            case 2:
                i = msg.charCodeAt(msg_len - 2) << 24 | msg.charCodeAt(msg_len - 1) << 16 | 0x08000;
                break;

            case 3:
                i = msg.charCodeAt(msg_len - 3) << 24 | msg.charCodeAt(msg_len - 2) << 16 | msg.charCodeAt(msg_len - 1) << 8 | 0x80;
                break;
        }

        word_array.push(i);

        while ((word_array.length % 16) != 14) {
            word_array.push(0);
        }

        word_array.push(msg_len >>> 29);
        word_array.push((msg_len << 3) & 0x0ffffffff);


        for (blockStart = 0; blockStart < word_array.length; blockStart += 16) {

            for (i = 0; i < 16; i++) {
                W[i] = word_array[blockStart + i];
            }

            for (i = 16; i <= 79; i++) {
                W[i] = rotateLeft(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
            }

            A = H0;
            B = H1;
            C = H2;
            D = H3;
            E = H4;

            for (i = 0; i <= 19; i++) {
                temp = (rotateLeft(A, 5) + ((B & C) | (~B & D)) + E + W[i] + 0x5A827999) & 0x0ffffffff;
                E = D;
                D = C;
                C = rotateLeft(B, 30);
                B = A;
                A = temp;
            }

            for (i = 20; i <= 39; i++) {
                temp = (rotateLeft(A, 5) + (B ^ C ^ D) + E + W[i] + 0x6ED9EBA1) & 0x0ffffffff;
                E = D;
                D = C;
                C = rotateLeft(B, 30);
                B = A;
                A = temp;
            }

            for (i = 40; i <= 59; i++) {
                temp = (rotateLeft(A, 5) + ((B & C) | (B & D) | (C & D)) + E + W[i] + 0x8F1BBCDC) & 0x0ffffffff;
                E = D;
                D = C;
                C = rotateLeft(B, 30);
                B = A;
                A = temp;
            }

            for (i = 60; i <= 79; i++) {
                temp = (rotateLeft(A, 5) + (B ^ C ^ D) + E + W[i] + 0xCA62C1D6) & 0x0ffffffff;
                E = D;
                D = C;
                C = rotateLeft(B, 30);
                B = A;
                A = temp;
            }

            H0 = (H0 + A) & 0x0ffffffff;
            H1 = (H1 + B) & 0x0ffffffff;
            H2 = (H2 + C) & 0x0ffffffff;
            H3 = (H3 + D) & 0x0ffffffff;
            H4 = (H4 + E) & 0x0ffffffff;

        }

        temp = cvtHex(H0) + cvtHex(H1) + cvtHex(H2) + cvtHex(H3) + cvtHex(H4);
        return temp.toLowerCase();
    };

    return SprdDataSource;
});