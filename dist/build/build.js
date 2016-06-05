(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){

/* **********************************************
     Begin prism-core.js
********************************************** */

var _self = (typeof window !== 'undefined')
	? window   // if in browser
	: (
		(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
		? self // if in worker
		: {}   // if in node js
	);

/**
 * Prism: Lightweight, robust, elegant syntax highlighting
 * MIT license http://www.opensource.org/licenses/mit-license.php/
 * @author Lea Verou http://lea.verou.me
 */

var Prism = (function(){

// Private helper vars
var lang = /\blang(?:uage)?-(\w+)\b/i;
var uniqueId = 0;

var _ = _self.Prism = {
	util: {
		encode: function (tokens) {
			if (tokens instanceof Token) {
				return new Token(tokens.type, _.util.encode(tokens.content), tokens.alias);
			} else if (_.util.type(tokens) === 'Array') {
				return tokens.map(_.util.encode);
			} else {
				return tokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, ' ');
			}
		},

		type: function (o) {
			return Object.prototype.toString.call(o).match(/\[object (\w+)\]/)[1];
		},

		objId: function (obj) {
			if (!obj['__id']) {
				Object.defineProperty(obj, '__id', { value: ++uniqueId });
			}
			return obj['__id'];
		},

		// Deep clone a language definition (e.g. to extend it)
		clone: function (o) {
			var type = _.util.type(o);

			switch (type) {
				case 'Object':
					var clone = {};

					for (var key in o) {
						if (o.hasOwnProperty(key)) {
							clone[key] = _.util.clone(o[key]);
						}
					}

					return clone;

				case 'Array':
					// Check for existence for IE8
					return o.map && o.map(function(v) { return _.util.clone(v); });
			}

			return o;
		}
	},

	languages: {
		extend: function (id, redef) {
			var lang = _.util.clone(_.languages[id]);

			for (var key in redef) {
				lang[key] = redef[key];
			}

			return lang;
		},

		/**
		 * Insert a token before another token in a language literal
		 * As this needs to recreate the object (we cannot actually insert before keys in object literals),
		 * we cannot just provide an object, we need anobject and a key.
		 * @param inside The key (or language id) of the parent
		 * @param before The key to insert before. If not provided, the function appends instead.
		 * @param insert Object with the key/value pairs to insert
		 * @param root The object that contains `inside`. If equal to Prism.languages, it can be omitted.
		 */
		insertBefore: function (inside, before, insert, root) {
			root = root || _.languages;
			var grammar = root[inside];

			if (arguments.length == 2) {
				insert = arguments[1];

				for (var newToken in insert) {
					if (insert.hasOwnProperty(newToken)) {
						grammar[newToken] = insert[newToken];
					}
				}

				return grammar;
			}

			var ret = {};

			for (var token in grammar) {

				if (grammar.hasOwnProperty(token)) {

					if (token == before) {

						for (var newToken in insert) {

							if (insert.hasOwnProperty(newToken)) {
								ret[newToken] = insert[newToken];
							}
						}
					}

					ret[token] = grammar[token];
				}
			}

			// Update references in other language definitions
			_.languages.DFS(_.languages, function(key, value) {
				if (value === root[inside] && key != inside) {
					this[key] = ret;
				}
			});

			return root[inside] = ret;
		},

		// Traverse a language definition with Depth First Search
		DFS: function(o, callback, type, visited) {
			visited = visited || {};
			for (var i in o) {
				if (o.hasOwnProperty(i)) {
					callback.call(o, i, o[i], type || i);

					if (_.util.type(o[i]) === 'Object' && !visited[_.util.objId(o[i])]) {
						visited[_.util.objId(o[i])] = true;
						_.languages.DFS(o[i], callback, null, visited);
					}
					else if (_.util.type(o[i]) === 'Array' && !visited[_.util.objId(o[i])]) {
						visited[_.util.objId(o[i])] = true;
						_.languages.DFS(o[i], callback, i, visited);
					}
				}
			}
		}
	},
	plugins: {},

	highlightAll: function(async, callback) {
		var env = {
			callback: callback,
			selector: 'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code'
		};

		_.hooks.run("before-highlightall", env);

		var elements = env.elements || document.querySelectorAll(env.selector);

		for (var i=0, element; element = elements[i++];) {
			_.highlightElement(element, async === true, env.callback);
		}
	},

	highlightElement: function(element, async, callback) {
		// Find language
		var language, grammar, parent = element;

		while (parent && !lang.test(parent.className)) {
			parent = parent.parentNode;
		}

		if (parent) {
			language = (parent.className.match(lang) || [,''])[1].toLowerCase();
			grammar = _.languages[language];
		}

		// Set language on the element, if not present
		element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

		// Set language on the parent, for styling
		parent = element.parentNode;

		if (/pre/i.test(parent.nodeName)) {
			parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
		}

		var code = element.textContent;

		var env = {
			element: element,
			language: language,
			grammar: grammar,
			code: code
		};

		_.hooks.run('before-sanity-check', env);

		if (!env.code || !env.grammar) {
			_.hooks.run('complete', env);
			return;
		}

		_.hooks.run('before-highlight', env);

		if (async && _self.Worker) {
			var worker = new Worker(_.filename);

			worker.onmessage = function(evt) {
				env.highlightedCode = evt.data;

				_.hooks.run('before-insert', env);

				env.element.innerHTML = env.highlightedCode;

				callback && callback.call(env.element);
				_.hooks.run('after-highlight', env);
				_.hooks.run('complete', env);
			};

			worker.postMessage(JSON.stringify({
				language: env.language,
				code: env.code,
				immediateClose: true
			}));
		}
		else {
			env.highlightedCode = _.highlight(env.code, env.grammar, env.language);

			_.hooks.run('before-insert', env);

			env.element.innerHTML = env.highlightedCode;

			callback && callback.call(element);

			_.hooks.run('after-highlight', env);
			_.hooks.run('complete', env);
		}
	},

	highlight: function (text, grammar, language) {
		var tokens = _.tokenize(text, grammar);
		return Token.stringify(_.util.encode(tokens), language);
	},

	tokenize: function(text, grammar, language) {
		var Token = _.Token;

		var strarr = [text];

		var rest = grammar.rest;

		if (rest) {
			for (var token in rest) {
				grammar[token] = rest[token];
			}

			delete grammar.rest;
		}

		tokenloop: for (var token in grammar) {
			if(!grammar.hasOwnProperty(token) || !grammar[token]) {
				continue;
			}

			var patterns = grammar[token];
			patterns = (_.util.type(patterns) === "Array") ? patterns : [patterns];

			for (var j = 0; j < patterns.length; ++j) {
				var pattern = patterns[j],
					inside = pattern.inside,
					lookbehind = !!pattern.lookbehind,
					greedy = !!pattern.greedy,
					lookbehindLength = 0,
					alias = pattern.alias;

				pattern = pattern.pattern || pattern;

				for (var i=0; i<strarr.length; i++) { // Don’t cache length as it changes during the loop

					var str = strarr[i];

					if (strarr.length > text.length) {
						// Something went terribly wrong, ABORT, ABORT!
						break tokenloop;
					}

					if (str instanceof Token) {
						continue;
					}

					pattern.lastIndex = 0;

					var match = pattern.exec(str),
					    delNum = 1;

					// Greedy patterns can override/remove up to two previously matched tokens
					if (!match && greedy && i != strarr.length - 1) {
						// Reconstruct the original text using the next two tokens
						var nextToken = strarr[i + 1].matchedStr || strarr[i + 1],
						    combStr = str + nextToken;

						if (i < strarr.length - 2) {
							combStr += strarr[i + 2].matchedStr || strarr[i + 2];
						}

						// Try the pattern again on the reconstructed text
						pattern.lastIndex = 0;
						match = pattern.exec(combStr);
						if (!match) {
							continue;
						}

						var from = match.index + (lookbehind ? match[1].length : 0);
						// To be a valid candidate, the new match has to start inside of str
						if (from >= str.length) {
							continue;
						}
						var to = match.index + match[0].length,
						    len = str.length + nextToken.length;

						// Number of tokens to delete and replace with the new match
						delNum = 3;

						if (to <= len) {
							if (strarr[i + 1].greedy) {
								continue;
							}
							delNum = 2;
							combStr = combStr.slice(0, len);
						}
						str = combStr;
					}

					if (!match) {
						continue;
					}

					if(lookbehind) {
						lookbehindLength = match[1].length;
					}

					var from = match.index + lookbehindLength,
					    match = match[0].slice(lookbehindLength),
					    to = from + match.length,
					    before = str.slice(0, from),
					    after = str.slice(to);

					var args = [i, delNum];

					if (before) {
						args.push(before);
					}

					var wrapped = new Token(token, inside? _.tokenize(match, inside) : match, alias, match, greedy);

					args.push(wrapped);

					if (after) {
						args.push(after);
					}

					Array.prototype.splice.apply(strarr, args);
				}
			}
		}

		return strarr;
	},

	hooks: {
		all: {},

		add: function (name, callback) {
			var hooks = _.hooks.all;

			hooks[name] = hooks[name] || [];

			hooks[name].push(callback);
		},

		run: function (name, env) {
			var callbacks = _.hooks.all[name];

			if (!callbacks || !callbacks.length) {
				return;
			}

			for (var i=0, callback; callback = callbacks[i++];) {
				callback(env);
			}
		}
	}
};

var Token = _.Token = function(type, content, alias, matchedStr, greedy) {
	this.type = type;
	this.content = content;
	this.alias = alias;
	// Copy of the full string this token was created from
	this.matchedStr = matchedStr || null;
	this.greedy = !!greedy;
};

Token.stringify = function(o, language, parent) {
	if (typeof o == 'string') {
		return o;
	}

	if (_.util.type(o) === 'Array') {
		return o.map(function(element) {
			return Token.stringify(element, language, o);
		}).join('');
	}

	var env = {
		type: o.type,
		content: Token.stringify(o.content, language, parent),
		tag: 'span',
		classes: ['token', o.type],
		attributes: {},
		language: language,
		parent: parent
	};

	if (env.type == 'comment') {
		env.attributes['spellcheck'] = 'true';
	}

	if (o.alias) {
		var aliases = _.util.type(o.alias) === 'Array' ? o.alias : [o.alias];
		Array.prototype.push.apply(env.classes, aliases);
	}

	_.hooks.run('wrap', env);

	var attributes = '';

	for (var name in env.attributes) {
		attributes += (attributes ? ' ' : '') + name + '="' + (env.attributes[name] || '') + '"';
	}

	return '<' + env.tag + ' class="' + env.classes.join(' ') + '" ' + attributes + '>' + env.content + '</' + env.tag + '>';

};

if (!_self.document) {
	if (!_self.addEventListener) {
		// in Node.js
		return _self.Prism;
	}
 	// In worker
	_self.addEventListener('message', function(evt) {
		var message = JSON.parse(evt.data),
		    lang = message.language,
		    code = message.code,
		    immediateClose = message.immediateClose;

		_self.postMessage(_.highlight(code, _.languages[lang], lang));
		if (immediateClose) {
			_self.close();
		}
	}, false);

	return _self.Prism;
}

//Get current script and highlight
var script = document.currentScript || [].slice.call(document.getElementsByTagName("script")).pop();

if (script) {
	_.filename = script.src;

	if (document.addEventListener && !script.hasAttribute('data-manual')) {
		document.addEventListener('DOMContentLoaded', _.highlightAll);
	}
}

return _self.Prism;

})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = Prism;
}

// hack for components to work correctly in node.js
if (typeof global !== 'undefined') {
	global.Prism = Prism;
}


/* **********************************************
     Begin prism-markup.js
********************************************** */

Prism.languages.markup = {
	'comment': /<!--[\w\W]*?-->/,
	'prolog': /<\?[\w\W]+?\?>/,
	'doctype': /<!DOCTYPE[\w\W]+?>/,
	'cdata': /<!\[CDATA\[[\w\W]*?]]>/i,
	'tag': {
		pattern: /<\/?(?!\d)[^\s>\/=.$<]+(?:\s+[^\s>\/=]+(?:=(?:("|')(?:\\\1|\\?(?!\1)[\w\W])*\1|[^\s'">=]+))?)*\s*\/?>/i,
		inside: {
			'tag': {
				pattern: /^<\/?[^\s>\/]+/i,
				inside: {
					'punctuation': /^<\/?/,
					'namespace': /^[^\s>\/:]+:/
				}
			},
			'attr-value': {
				pattern: /=(?:('|")[\w\W]*?(\1)|[^\s>]+)/i,
				inside: {
					'punctuation': /[=>"']/
				}
			},
			'punctuation': /\/?>/,
			'attr-name': {
				pattern: /[^\s>\/]+/,
				inside: {
					'namespace': /^[^\s>\/:]+:/
				}
			}

		}
	},
	'entity': /&#?[\da-z]{1,8};/i
};

// Plugin to make entity title show the real entity, idea by Roman Komarov
Prism.hooks.add('wrap', function(env) {

	if (env.type === 'entity') {
		env.attributes['title'] = env.content.replace(/&amp;/, '&');
	}
});

Prism.languages.xml = Prism.languages.markup;
Prism.languages.html = Prism.languages.markup;
Prism.languages.mathml = Prism.languages.markup;
Prism.languages.svg = Prism.languages.markup;


/* **********************************************
     Begin prism-css.js
********************************************** */

Prism.languages.css = {
	'comment': /\/\*[\w\W]*?\*\//,
	'atrule': {
		pattern: /@[\w-]+?.*?(;|(?=\s*\{))/i,
		inside: {
			'rule': /@[\w-]+/
			// See rest below
		}
	},
	'url': /url\((?:(["'])(\\(?:\r\n|[\w\W])|(?!\1)[^\\\r\n])*\1|.*?)\)/i,
	'selector': /[^\{\}\s][^\{\};]*?(?=\s*\{)/,
	'string': /("|')(\\(?:\r\n|[\w\W])|(?!\1)[^\\\r\n])*\1/,
	'property': /(\b|\B)[\w-]+(?=\s*:)/i,
	'important': /\B!important\b/i,
	'function': /[-a-z0-9]+(?=\()/i,
	'punctuation': /[(){};:]/
};

Prism.languages.css['atrule'].inside.rest = Prism.util.clone(Prism.languages.css);

if (Prism.languages.markup) {
	Prism.languages.insertBefore('markup', 'tag', {
		'style': {
			pattern: /(<style[\w\W]*?>)[\w\W]*?(?=<\/style>)/i,
			lookbehind: true,
			inside: Prism.languages.css,
			alias: 'language-css'
		}
	});
	
	Prism.languages.insertBefore('inside', 'attr-value', {
		'style-attr': {
			pattern: /\s*style=("|').*?\1/i,
			inside: {
				'attr-name': {
					pattern: /^\s*style/i,
					inside: Prism.languages.markup.tag.inside
				},
				'punctuation': /^\s*=\s*['"]|['"]\s*$/,
				'attr-value': {
					pattern: /.+/i,
					inside: Prism.languages.css
				}
			},
			alias: 'language-css'
		}
	}, Prism.languages.markup.tag);
}

/* **********************************************
     Begin prism-clike.js
********************************************** */

Prism.languages.clike = {
	'comment': [
		{
			pattern: /(^|[^\\])\/\*[\w\W]*?\*\//,
			lookbehind: true
		},
		{
			pattern: /(^|[^\\:])\/\/.*/,
			lookbehind: true
		}
	],
	'string': {
		pattern: /(["'])(\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
		greedy: true
	},
	'class-name': {
		pattern: /((?:\b(?:class|interface|extends|implements|trait|instanceof|new)\s+)|(?:catch\s+\())[a-z0-9_\.\\]+/i,
		lookbehind: true,
		inside: {
			punctuation: /(\.|\\)/
		}
	},
	'keyword': /\b(if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/,
	'boolean': /\b(true|false)\b/,
	'function': /[a-z0-9_]+(?=\()/i,
	'number': /\b-?(?:0x[\da-f]+|\d*\.?\d+(?:e[+-]?\d+)?)\b/i,
	'operator': /--?|\+\+?|!=?=?|<=?|>=?|==?=?|&&?|\|\|?|\?|\*|\/|~|\^|%/,
	'punctuation': /[{}[\];(),.:]/
};


/* **********************************************
     Begin prism-javascript.js
********************************************** */

Prism.languages.javascript = Prism.languages.extend('clike', {
	'keyword': /\b(as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b/,
	'number': /\b-?(0x[\dA-Fa-f]+|0b[01]+|0o[0-7]+|\d*\.?\d+([Ee][+-]?\d+)?|NaN|Infinity)\b/,
	// Allow for all non-ASCII characters (See http://stackoverflow.com/a/2008444)
	'function': /[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*(?=\()/i
});

Prism.languages.insertBefore('javascript', 'keyword', {
	'regex': {
		pattern: /(^|[^/])\/(?!\/)(\[.+?]|\\.|[^/\\\r\n])+\/[gimyu]{0,5}(?=\s*($|[\r\n,.;})]))/,
		lookbehind: true,
		greedy: true
	}
});

Prism.languages.insertBefore('javascript', 'class-name', {
	'template-string': {
		pattern: /`(?:\\\\|\\?[^\\])*?`/,
		greedy: true,
		inside: {
			'interpolation': {
				pattern: /\$\{[^}]+\}/,
				inside: {
					'interpolation-punctuation': {
						pattern: /^\$\{|\}$/,
						alias: 'punctuation'
					},
					rest: Prism.languages.javascript
				}
			},
			'string': /[\s\S]+/
		}
	}
});

if (Prism.languages.markup) {
	Prism.languages.insertBefore('markup', 'tag', {
		'script': {
			pattern: /(<script[\w\W]*?>)[\w\W]*?(?=<\/script>)/i,
			lookbehind: true,
			inside: Prism.languages.javascript,
			alias: 'language-javascript'
		}
	});
}

Prism.languages.js = Prism.languages.javascript;

/* **********************************************
     Begin prism-file-highlight.js
********************************************** */

(function () {
	if (typeof self === 'undefined' || !self.Prism || !self.document || !document.querySelector) {
		return;
	}

	self.Prism.fileHighlight = function() {

		var Extensions = {
			'js': 'javascript',
			'py': 'python',
			'rb': 'ruby',
			'ps1': 'powershell',
			'psm1': 'powershell',
			'sh': 'bash',
			'bat': 'batch',
			'h': 'c',
			'tex': 'latex'
		};

		if(Array.prototype.forEach) { // Check to prevent error in IE8
			Array.prototype.slice.call(document.querySelectorAll('pre[data-src]')).forEach(function (pre) {
				var src = pre.getAttribute('data-src');

				var language, parent = pre;
				var lang = /\blang(?:uage)?-(?!\*)(\w+)\b/i;
				while (parent && !lang.test(parent.className)) {
					parent = parent.parentNode;
				}

				if (parent) {
					language = (pre.className.match(lang) || [, ''])[1];
				}

				if (!language) {
					var extension = (src.match(/\.(\w+)$/) || [, ''])[1];
					language = Extensions[extension] || extension;
				}

				var code = document.createElement('code');
				code.className = 'language-' + language;

				pre.textContent = '';

				code.textContent = 'Loading…';

				pre.appendChild(code);

				var xhr = new XMLHttpRequest();

				xhr.open('GET', src, true);

				xhr.onreadystatechange = function () {
					if (xhr.readyState == 4) {

						if (xhr.status < 400 && xhr.responseText) {
							code.textContent = xhr.responseText;

							Prism.highlightElement(code);
						}
						else if (xhr.status >= 400) {
							code.textContent = '✖ Error ' + xhr.status + ' while fetching file: ' + xhr.statusText;
						}
						else {
							code.textContent = '✖ Error: File does not exist or is empty';
						}
					}
				};

				xhr.send(null);
			});
		}

	};

	document.addEventListener('DOMContentLoaded', self.Prism.fileHighlight);

})();

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],2:[function(require,module,exports){
module.exports = function() {
  return function(deck) {
    var backdrops;

    function createBackdropForSlide(slide) {
      var backdropAttribute = slide.getAttribute('data-bespoke-backdrop');

      if (backdropAttribute) {
        var backdrop = document.createElement('div');
        backdrop.className = backdropAttribute;
        backdrop.classList.add('bespoke-backdrop');
        deck.parent.appendChild(backdrop);
        return backdrop;
      }
    }

    function updateClasses(el) {
      if (el) {
        var index = backdrops.indexOf(el),
          currentIndex = deck.slide();

        removeClass(el, 'active');
        removeClass(el, 'inactive');
        removeClass(el, 'before');
        removeClass(el, 'after');

        if (index !== currentIndex) {
          addClass(el, 'inactive');
          addClass(el, index < currentIndex ? 'before' : 'after');
        } else {
          addClass(el, 'active');
        }
      }
    }

    function removeClass(el, className) {
      el.classList.remove('bespoke-backdrop-' + className);
    }

    function addClass(el, className) {
      el.classList.add('bespoke-backdrop-' + className);
    }

    backdrops = deck.slides
      .map(createBackdropForSlide);

    deck.on('activate', function() {
      backdrops.forEach(updateClasses);
    });
  };
};

},{}],3:[function(require,module,exports){
module.exports = function(options) {
  return function(deck) {
    var activeSlideIndex,
      activeBulletIndex,

      bullets = deck.slides.map(function(slide) {
        return [].slice.call(slide.querySelectorAll((typeof options === 'string' ? options : '[data-bespoke-bullet]')), 0);
      }),

      next = function() {
        var nextSlideIndex = activeSlideIndex + 1;

        if (activeSlideHasBulletByOffset(1)) {
          activateBullet(activeSlideIndex, activeBulletIndex + 1);
          return false;
        } else if (bullets[nextSlideIndex]) {
          activateBullet(nextSlideIndex, 0);
        }
      },

      prev = function() {
        var prevSlideIndex = activeSlideIndex - 1;

        if (activeSlideHasBulletByOffset(-1)) {
          activateBullet(activeSlideIndex, activeBulletIndex - 1);
          return false;
        } else if (bullets[prevSlideIndex]) {
          activateBullet(prevSlideIndex, bullets[prevSlideIndex].length - 1);
        }
      },

      activateBullet = function(slideIndex, bulletIndex) {
        activeSlideIndex = slideIndex;
        activeBulletIndex = bulletIndex;

        bullets.forEach(function(slide, s) {
          slide.forEach(function(bullet, b) {
            bullet.classList.add('bespoke-bullet');

            if (s < slideIndex || s === slideIndex && b <= bulletIndex) {
              bullet.classList.add('bespoke-bullet-active');
              bullet.classList.remove('bespoke-bullet-inactive');
            } else {
              bullet.classList.add('bespoke-bullet-inactive');
              bullet.classList.remove('bespoke-bullet-active');
            }

            if (s === slideIndex && b === bulletIndex) {
              bullet.classList.add('bespoke-bullet-current');
            } else {
              bullet.classList.remove('bespoke-bullet-current');
            }
          });
        });
      },

      activeSlideHasBulletByOffset = function(offset) {
        return bullets[activeSlideIndex][activeBulletIndex + offset] !== undefined;
      };

    deck.on('next', next);
    deck.on('prev', prev);

    deck.on('slide', function(e) {
      activateBullet(e.index, 0);
    });

    activateBullet(0, 0);
  };
};

},{}],4:[function(require,module,exports){
module.exports = function() {
  return function(deck) {
    deck.slides.forEach(function(slide) {
      slide.addEventListener('keydown', function(e) {
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.nodeName) || e.target.contentEditable === 'true') {
          e.stopPropagation();
        }
      });
    });
  };
};

},{}],5:[function(require,module,exports){
module.exports = function() {
  return function(deck) {
    var parseHash = function() {
      var hash = window.location.hash.slice(1),
        slideNumberOrName = parseInt(hash, 10);

      if (hash) {
        if (slideNumberOrName) {
          activateSlide(slideNumberOrName - 1);
        } else {
          deck.slides.forEach(function(slide, i) {
            if (slide.getAttribute('data-bespoke-hash') === hash) {
              activateSlide(i);
            }
          });
        }
      }
    };

    var activateSlide = function(index) {
      var indexToActivate = -1 < index && index < deck.slides.length ? index : 0;
      if (indexToActivate !== deck.slide()) {
        deck.slide(indexToActivate);
      }
    };

    setTimeout(function() {
      parseHash();

      deck.on('activate', function(e) {
        var slideName = e.slide.getAttribute('data-bespoke-hash');
        window.location.hash = slideName || e.index + 1;
      });

      window.addEventListener('hashchange', parseHash);
    }, 0);
  };
};

},{}],6:[function(require,module,exports){
module.exports = function(options) {
  return function(deck) {
    var isHorizontal = options !== 'vertical';

    document.addEventListener('keydown', function(e) {
      if (e.which == 34 || // PAGE DOWN
        (e.which == 32 && !e.shiftKey) || // SPACE WITHOUT SHIFT
        (isHorizontal && e.which == 39) || // RIGHT
        (!isHorizontal && e.which == 40) // DOWN
      ) { deck.next(); }

      if (e.which == 33 || // PAGE UP
        (e.which == 32 && e.shiftKey) || // SPACE + SHIFT
        (isHorizontal && e.which == 37) || // LEFT
        (!isHorizontal && e.which == 38) // UP
      ) { deck.prev(); }
    });
  };
};

},{}],7:[function(require,module,exports){
module.exports = function(options) {
  return function (deck) {
    var progressParent = document.createElement('div'),
      progressBar = document.createElement('div'),
      prop = options === 'vertical' ? 'height' : 'width';

    progressParent.className = 'bespoke-progress-parent';
    progressBar.className = 'bespoke-progress-bar';
    progressParent.appendChild(progressBar);
    deck.parent.appendChild(progressParent);

    deck.on('activate', function(e) {
      progressBar.style[prop] = (e.index * 100 / (deck.slides.length - 1)) + '%';
    });
  };
};

},{}],8:[function(require,module,exports){
module.exports = function(options) {
  return function(deck) {
    var parent = deck.parent,
      firstSlide = deck.slides[0],
      slideHeight = firstSlide.offsetHeight,
      slideWidth = firstSlide.offsetWidth,
      useZoom = options === 'zoom' || ('zoom' in parent.style && options !== 'transform'),

      wrap = function(element) {
        var wrapper = document.createElement('div');
        wrapper.className = 'bespoke-scale-parent';
        element.parentNode.insertBefore(wrapper, element);
        wrapper.appendChild(element);
        return wrapper;
      },

      elements = useZoom ? deck.slides : deck.slides.map(wrap),

      transformProperty = (function(property) {
        var prefixes = 'Moz Webkit O ms'.split(' ');
        return prefixes.reduce(function(currentProperty, prefix) {
            return prefix + property in parent.style ? prefix + property : currentProperty;
          }, property.toLowerCase());
      }('Transform')),

      scale = useZoom ?
        function(ratio, element) {
          element.style.zoom = ratio;
        } :
        function(ratio, element) {
          element.style[transformProperty] = 'scale(' + ratio + ')';
        },

      scaleAll = function() {
        var xScale = parent.offsetWidth / slideWidth,
          yScale = parent.offsetHeight / slideHeight;

        elements.forEach(scale.bind(null, Math.min(xScale, yScale)));
      };

    window.addEventListener('resize', scaleAll);
    scaleAll();
  };

};

},{}],9:[function(require,module,exports){
(function (global){
/*!
 * bespoke-theme-cube v2.0.1
 *
 * Copyright 2014, Mark Dalgleish
 * This content is released under the MIT license
 * http://mit-license.org/markdalgleish
 */

!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self);var f=o;f=f.bespoke||(f.bespoke={}),f=f.themes||(f.themes={}),f.cube=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){

var classes = _dereq_('bespoke-classes');
var insertCss = _dereq_('insert-css');

module.exports = function() {
  var css = "*{-moz-box-sizing:border-box;box-sizing:border-box;margin:0;padding:0}@media print{*{-webkit-print-color-adjust:exact}}@page{size:landscape;margin:0}.bespoke-parent{-webkit-transition:background .6s ease;transition:background .6s ease;position:absolute;top:0;bottom:0;left:0;right:0;overflow:hidden}@media print{.bespoke-parent{overflow:visible;position:static}}.bespoke-theme-cube-slide-parent{position:absolute;top:0;left:0;right:0;bottom:0;-webkit-perspective:600px;perspective:600px;pointer-events:none}.bespoke-slide{pointer-events:auto;-webkit-transition:-webkit-transform .6s ease,opacity .6s ease,background .6s ease;transition:transform .6s ease,opacity .6s ease,background .6s ease;-webkit-transform-origin:50% 50% 0;transform-origin:50% 50% 0;-webkit-backface-visibility:hidden;backface-visibility:hidden;display:-webkit-box;display:-webkit-flex;display:-ms-flexbox;display:flex;-webkit-box-orient:vertical;-webkit-box-direction:normal;-webkit-flex-direction:column;-ms-flex-direction:column;flex-direction:column;-webkit-box-pack:center;-webkit-justify-content:center;-ms-flex-pack:center;justify-content:center;-webkit-box-align:center;-webkit-align-items:center;-ms-flex-align:center;align-items:center;text-align:center;width:640px;height:480px;position:absolute;top:50%;margin-top:-240px;left:50%;margin-left:-320px;background:#eaeaea;padding:40px;border-radius:0}@media print{.bespoke-slide{zoom:1!important;height:743px;width:100%;page-break-before:always;position:static;margin:0;-webkit-transition:none;transition:none}}.bespoke-before{-webkit-transform:translateX(100px)translateX(-320px)rotateY(-90deg)translateX(-320px);transform:translateX(100px)translateX(-320px)rotateY(-90deg)translateX(-320px)}@media print{.bespoke-before{-webkit-transform:none;transform:none}}.bespoke-after{-webkit-transform:translateX(-100px)translateX(320px)rotateY(90deg)translateX(320px);transform:translateX(-100px)translateX(320px)rotateY(90deg)translateX(320px)}@media print{.bespoke-after{-webkit-transform:none;transform:none}}.bespoke-inactive{opacity:0;pointer-events:none}@media print{.bespoke-inactive{opacity:1}}.bespoke-active{opacity:1}.bespoke-bullet{-webkit-transition:all .3s ease;transition:all .3s ease}@media print{.bespoke-bullet{-webkit-transition:none;transition:none}}.bespoke-bullet-inactive{opacity:0}li.bespoke-bullet-inactive{-webkit-transform:translateX(16px);transform:translateX(16px)}@media print{li.bespoke-bullet-inactive{-webkit-transform:none;transform:none}}@media print{.bespoke-bullet-inactive{opacity:1}}.bespoke-bullet-active{opacity:1}.bespoke-scale-parent{-webkit-perspective:600px;perspective:600px;position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none}.bespoke-scale-parent .bespoke-active{pointer-events:auto}@media print{.bespoke-scale-parent{-webkit-transform:none!important;transform:none!important}}.bespoke-progress-parent{position:absolute;top:0;left:0;right:0;height:2px}@media only screen and (min-width:1366px){.bespoke-progress-parent{height:4px}}@media print{.bespoke-progress-parent{display:none}}.bespoke-progress-bar{-webkit-transition:width .6s ease;transition:width .6s ease;position:absolute;height:100%;background:#0089f3;border-radius:0 4px 4px 0}.emphatic{background:#eaeaea}.bespoke-backdrop{position:absolute;top:0;left:0;right:0;bottom:0;-webkit-transform:translateZ(0);transform:translateZ(0);-webkit-transition:opacity .6s ease;transition:opacity .6s ease;opacity:0;z-index:-1}.bespoke-backdrop-active{opacity:1}pre{padding:26px!important;border-radius:8px}body{font-family:helvetica,arial,sans-serif;font-size:18px;color:#404040}h1{font-size:72px;line-height:82px;letter-spacing:-2px;margin-bottom:16px}h2{font-size:42px;letter-spacing:-1px;margin-bottom:8px}h3{font-size:24px;font-weight:400;margin-bottom:24px;color:#606060}hr{visibility:hidden;height:20px}ul{list-style:none}li{margin-bottom:12px}p{margin:0 100px 12px;line-height:22px}a{color:#0089f3;text-decoration:none}";
  insertCss(css, { prepend: true });

  return function(deck) {
    classes()(deck);

    var wrap = function(element) {
      var wrapper = document.createElement('div');
      wrapper.className = 'bespoke-theme-cube-slide-parent';
      element.parentNode.insertBefore(wrapper, element);
      wrapper.appendChild(element);
    };

    deck.slides.forEach(wrap);
  };
};

},{"bespoke-classes":2,"insert-css":3}],2:[function(_dereq_,module,exports){
module.exports = function() {
  return function(deck) {
    var addClass = function(el, cls) {
        el.classList.add('bespoke-' + cls);
      },

      removeClass = function(el, cls) {
        el.className = el.className
          .replace(new RegExp('bespoke-' + cls +'(\\s|$)', 'g'), ' ')
          .trim();
      },

      deactivate = function(el, index) {
        var activeSlide = deck.slides[deck.slide()],
          offset = index - deck.slide(),
          offsetClass = offset > 0 ? 'after' : 'before';

        ['before(-\\d+)?', 'after(-\\d+)?', 'active', 'inactive'].map(removeClass.bind(null, el));

        if (el !== activeSlide) {
          ['inactive', offsetClass, offsetClass + '-' + Math.abs(offset)].map(addClass.bind(null, el));
        }
      };

    addClass(deck.parent, 'parent');
    deck.slides.map(function(el) { addClass(el, 'slide'); });

    deck.on('activate', function(e) {
      deck.slides.map(deactivate);
      addClass(e.slide, 'active');
      removeClass(e.slide, 'inactive');
    });
  };
};

},{}],3:[function(_dereq_,module,exports){
var inserted = {};

module.exports = function (css, options) {
    if (inserted[css]) return;
    inserted[css] = true;
    
    var elem = document.createElement('style');
    elem.setAttribute('type', 'text/css');

    if ('textContent' in elem) {
      elem.textContent = css;
    } else {
      elem.styleSheet.cssText = css;
    }
    
    var head = document.getElementsByTagName('head')[0];
    if (options && options.prepend) {
        head.insertBefore(elem, head.childNodes[0]);
    } else {
        head.appendChild(elem);
    }
};

},{}]},{},[1])
(1)
});
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],10:[function(require,module,exports){
module.exports = function(options) {
  return function(deck) {
    var axis = options == 'vertical' ? 'Y' : 'X',
      startPosition,
      delta;

    deck.parent.addEventListener('touchstart', function(e) {
      if (e.touches.length == 1) {
        startPosition = e.touches[0]['page' + axis];
        delta = 0;
      }
    });

    deck.parent.addEventListener('touchmove', function(e) {
      if (e.touches.length == 1) {
        e.preventDefault();
        delta = e.touches[0]['page' + axis] - startPosition;
      }
    });

    deck.parent.addEventListener('touchend', function() {
      if (Math.abs(delta) > 50) {
        deck[delta > 0 ? 'prev' : 'next']();
      }
    });
  };
};

},{}],11:[function(require,module,exports){
var from = function(opts, plugins) {
  var parent = (opts.parent || opts).nodeType === 1 ? (opts.parent || opts) : document.querySelector(opts.parent || opts),
    slides = [].filter.call(typeof opts.slides === 'string' ? parent.querySelectorAll(opts.slides) : (opts.slides || parent.children), function(el) { return el.nodeName !== 'SCRIPT'; }),
    activeSlide = slides[0],
    listeners = {},

    activate = function(index, customData) {
      if (!slides[index]) {
        return;
      }

      fire('deactivate', createEventData(activeSlide, customData));
      activeSlide = slides[index];
      fire('activate', createEventData(activeSlide, customData));
    },

    slide = function(index, customData) {
      if (arguments.length) {
        fire('slide', createEventData(slides[index], customData)) && activate(index, customData);
      } else {
        return slides.indexOf(activeSlide);
      }
    },

    step = function(offset, customData) {
      var slideIndex = slides.indexOf(activeSlide) + offset;

      fire(offset > 0 ? 'next' : 'prev', createEventData(activeSlide, customData)) && activate(slideIndex, customData);
    },

    on = function(eventName, callback) {
      (listeners[eventName] || (listeners[eventName] = [])).push(callback);
      return off.bind(null, eventName, callback);
    },

    off = function(eventName, callback) {
      listeners[eventName] = (listeners[eventName] || []).filter(function(listener) { return listener !== callback; });
    },

    fire = function(eventName, eventData) {
      return (listeners[eventName] || [])
        .reduce(function(notCancelled, callback) {
          return notCancelled && callback(eventData) !== false;
        }, true);
    },

    createEventData = function(el, eventData) {
      eventData = eventData || {};
      eventData.index = slides.indexOf(el);
      eventData.slide = el;
      return eventData;
    },

    deck = {
      on: on,
      off: off,
      fire: fire,
      slide: slide,
      next: step.bind(null, 1),
      prev: step.bind(null, -1),
      parent: parent,
      slides: slides
    };

  (plugins || []).forEach(function(plugin) {
    plugin(deck);
  });

  activate(0);

  return deck;
};

module.exports = {
  from: from
};

},{}],12:[function(require,module,exports){
// Require Node modules in the browser thanks to Browserify: http://browserify.org
var bespoke = require('bespoke'),
  cube = require('bespoke-theme-cube'),
  keys = require('bespoke-keys'),
  touch = require('bespoke-touch'),
  bullets = require('bespoke-bullets'),
  backdrop = require('bespoke-backdrop'),
  scale = require('bespoke-scale'),
  hash = require('bespoke-hash'),
  progress = require('bespoke-progress'),
  forms = require('bespoke-forms');

// Bespoke.js
bespoke.from('article', [
  cube(),
  keys(),
  touch(),
  bullets('li, .bullet'),
  backdrop(),
  scale(),
  hash(),
  progress(),
  forms()
]);

// Prism syntax highlighting
// This is actually loaded from "bower_components" thanks to
// debowerify: https://github.com/eugeneware/debowerify
require("./..\\..\\bower_components\\prism\\prism.js");


},{"./..\\..\\bower_components\\prism\\prism.js":1,"bespoke":11,"bespoke-backdrop":2,"bespoke-bullets":3,"bespoke-forms":4,"bespoke-hash":5,"bespoke-keys":6,"bespoke-progress":7,"bespoke-scale":8,"bespoke-theme-cube":9,"bespoke-touch":10}]},{},[12])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkQ6XFxEYXRhXFxLdWxpYWhcXFRLUFBMXFxjbG9uZTFcXFRLUFBMXFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJEOi9EYXRhL0t1bGlhaC9US1BQTC9jbG9uZTEvVEtQUEwvYm93ZXJfY29tcG9uZW50cy9wcmlzbS9wcmlzbS5qcyIsIkQ6L0RhdGEvS3VsaWFoL1RLUFBML2Nsb25lMS9US1BQTC9ub2RlX21vZHVsZXMvYmVzcG9rZS1iYWNrZHJvcC9saWIvYmVzcG9rZS1iYWNrZHJvcC5qcyIsIkQ6L0RhdGEvS3VsaWFoL1RLUFBML2Nsb25lMS9US1BQTC9ub2RlX21vZHVsZXMvYmVzcG9rZS1idWxsZXRzL2xpYi9iZXNwb2tlLWJ1bGxldHMuanMiLCJEOi9EYXRhL0t1bGlhaC9US1BQTC9jbG9uZTEvVEtQUEwvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtZm9ybXMvbGliL2Jlc3Bva2UtZm9ybXMuanMiLCJEOi9EYXRhL0t1bGlhaC9US1BQTC9jbG9uZTEvVEtQUEwvbm9kZV9tb2R1bGVzL2Jlc3Bva2UtaGFzaC9saWIvYmVzcG9rZS1oYXNoLmpzIiwiRDovRGF0YS9LdWxpYWgvVEtQUEwvY2xvbmUxL1RLUFBML25vZGVfbW9kdWxlcy9iZXNwb2tlLWtleXMvbGliL2Jlc3Bva2Uta2V5cy5qcyIsIkQ6L0RhdGEvS3VsaWFoL1RLUFBML2Nsb25lMS9US1BQTC9ub2RlX21vZHVsZXMvYmVzcG9rZS1wcm9ncmVzcy9saWIvYmVzcG9rZS1wcm9ncmVzcy5qcyIsIkQ6L0RhdGEvS3VsaWFoL1RLUFBML2Nsb25lMS9US1BQTC9ub2RlX21vZHVsZXMvYmVzcG9rZS1zY2FsZS9saWIvYmVzcG9rZS1zY2FsZS5qcyIsIkQ6L0RhdGEvS3VsaWFoL1RLUFBML2Nsb25lMS9US1BQTC9ub2RlX21vZHVsZXMvYmVzcG9rZS10aGVtZS1jdWJlL2Rpc3QvYmVzcG9rZS10aGVtZS1jdWJlLmpzIiwiRDovRGF0YS9LdWxpYWgvVEtQUEwvY2xvbmUxL1RLUFBML25vZGVfbW9kdWxlcy9iZXNwb2tlLXRvdWNoL2xpYi9iZXNwb2tlLXRvdWNoLmpzIiwiRDovRGF0YS9LdWxpYWgvVEtQUEwvY2xvbmUxL1RLUFBML25vZGVfbW9kdWxlcy9iZXNwb2tlL2xpYi9iZXNwb2tlLmpzIiwiRDovRGF0YS9LdWxpYWgvVEtQUEwvY2xvbmUxL1RLUFBML3NyYy9zY3JpcHRzL2Zha2VfNGRmOWEzZmIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzF3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG5cclxuLyogKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gICAgIEJlZ2luIHByaXNtLWNvcmUuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxudmFyIF9zZWxmID0gKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKVxyXG5cdD8gd2luZG93ICAgLy8gaWYgaW4gYnJvd3NlclxyXG5cdDogKFxyXG5cdFx0KHR5cGVvZiBXb3JrZXJHbG9iYWxTY29wZSAhPT0gJ3VuZGVmaW5lZCcgJiYgc2VsZiBpbnN0YW5jZW9mIFdvcmtlckdsb2JhbFNjb3BlKVxyXG5cdFx0PyBzZWxmIC8vIGlmIGluIHdvcmtlclxyXG5cdFx0OiB7fSAgIC8vIGlmIGluIG5vZGUganNcclxuXHQpO1xyXG5cclxuLyoqXHJcbiAqIFByaXNtOiBMaWdodHdlaWdodCwgcm9idXN0LCBlbGVnYW50IHN5bnRheCBoaWdobGlnaHRpbmdcclxuICogTUlUIGxpY2Vuc2UgaHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5waHAvXHJcbiAqIEBhdXRob3IgTGVhIFZlcm91IGh0dHA6Ly9sZWEudmVyb3UubWVcclxuICovXHJcblxyXG52YXIgUHJpc20gPSAoZnVuY3Rpb24oKXtcclxuXHJcbi8vIFByaXZhdGUgaGVscGVyIHZhcnNcclxudmFyIGxhbmcgPSAvXFxibGFuZyg/OnVhZ2UpPy0oXFx3KylcXGIvaTtcclxudmFyIHVuaXF1ZUlkID0gMDtcclxuXHJcbnZhciBfID0gX3NlbGYuUHJpc20gPSB7XHJcblx0dXRpbDoge1xyXG5cdFx0ZW5jb2RlOiBmdW5jdGlvbiAodG9rZW5zKSB7XHJcblx0XHRcdGlmICh0b2tlbnMgaW5zdGFuY2VvZiBUb2tlbikge1xyXG5cdFx0XHRcdHJldHVybiBuZXcgVG9rZW4odG9rZW5zLnR5cGUsIF8udXRpbC5lbmNvZGUodG9rZW5zLmNvbnRlbnQpLCB0b2tlbnMuYWxpYXMpO1xyXG5cdFx0XHR9IGVsc2UgaWYgKF8udXRpbC50eXBlKHRva2VucykgPT09ICdBcnJheScpIHtcclxuXHRcdFx0XHRyZXR1cm4gdG9rZW5zLm1hcChfLnV0aWwuZW5jb2RlKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRyZXR1cm4gdG9rZW5zLnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvPC9nLCAnJmx0OycpLnJlcGxhY2UoL1xcdTAwYTAvZywgJyAnKTtcclxuXHRcdFx0fVxyXG5cdFx0fSxcclxuXHJcblx0XHR0eXBlOiBmdW5jdGlvbiAobykge1xyXG5cdFx0XHRyZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pLm1hdGNoKC9cXFtvYmplY3QgKFxcdyspXFxdLylbMV07XHJcblx0XHR9LFxyXG5cclxuXHRcdG9iaklkOiBmdW5jdGlvbiAob2JqKSB7XHJcblx0XHRcdGlmICghb2JqWydfX2lkJ10pIHtcclxuXHRcdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCAnX19pZCcsIHsgdmFsdWU6ICsrdW5pcXVlSWQgfSk7XHJcblx0XHRcdH1cclxuXHRcdFx0cmV0dXJuIG9ialsnX19pZCddO1xyXG5cdFx0fSxcclxuXHJcblx0XHQvLyBEZWVwIGNsb25lIGEgbGFuZ3VhZ2UgZGVmaW5pdGlvbiAoZS5nLiB0byBleHRlbmQgaXQpXHJcblx0XHRjbG9uZTogZnVuY3Rpb24gKG8pIHtcclxuXHRcdFx0dmFyIHR5cGUgPSBfLnV0aWwudHlwZShvKTtcclxuXHJcblx0XHRcdHN3aXRjaCAodHlwZSkge1xyXG5cdFx0XHRcdGNhc2UgJ09iamVjdCc6XHJcblx0XHRcdFx0XHR2YXIgY2xvbmUgPSB7fTtcclxuXHJcblx0XHRcdFx0XHRmb3IgKHZhciBrZXkgaW4gbykge1xyXG5cdFx0XHRcdFx0XHRpZiAoby5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcblx0XHRcdFx0XHRcdFx0Y2xvbmVba2V5XSA9IF8udXRpbC5jbG9uZShvW2tleV0pO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0cmV0dXJuIGNsb25lO1xyXG5cclxuXHRcdFx0XHRjYXNlICdBcnJheSc6XHJcblx0XHRcdFx0XHQvLyBDaGVjayBmb3IgZXhpc3RlbmNlIGZvciBJRThcclxuXHRcdFx0XHRcdHJldHVybiBvLm1hcCAmJiBvLm1hcChmdW5jdGlvbih2KSB7IHJldHVybiBfLnV0aWwuY2xvbmUodik7IH0pO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRyZXR1cm4gbztcclxuXHRcdH1cclxuXHR9LFxyXG5cclxuXHRsYW5ndWFnZXM6IHtcclxuXHRcdGV4dGVuZDogZnVuY3Rpb24gKGlkLCByZWRlZikge1xyXG5cdFx0XHR2YXIgbGFuZyA9IF8udXRpbC5jbG9uZShfLmxhbmd1YWdlc1tpZF0pO1xyXG5cclxuXHRcdFx0Zm9yICh2YXIga2V5IGluIHJlZGVmKSB7XHJcblx0XHRcdFx0bGFuZ1trZXldID0gcmVkZWZba2V5XTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cmV0dXJuIGxhbmc7XHJcblx0XHR9LFxyXG5cclxuXHRcdC8qKlxyXG5cdFx0ICogSW5zZXJ0IGEgdG9rZW4gYmVmb3JlIGFub3RoZXIgdG9rZW4gaW4gYSBsYW5ndWFnZSBsaXRlcmFsXHJcblx0XHQgKiBBcyB0aGlzIG5lZWRzIHRvIHJlY3JlYXRlIHRoZSBvYmplY3QgKHdlIGNhbm5vdCBhY3R1YWxseSBpbnNlcnQgYmVmb3JlIGtleXMgaW4gb2JqZWN0IGxpdGVyYWxzKSxcclxuXHRcdCAqIHdlIGNhbm5vdCBqdXN0IHByb3ZpZGUgYW4gb2JqZWN0LCB3ZSBuZWVkIGFub2JqZWN0IGFuZCBhIGtleS5cclxuXHRcdCAqIEBwYXJhbSBpbnNpZGUgVGhlIGtleSAob3IgbGFuZ3VhZ2UgaWQpIG9mIHRoZSBwYXJlbnRcclxuXHRcdCAqIEBwYXJhbSBiZWZvcmUgVGhlIGtleSB0byBpbnNlcnQgYmVmb3JlLiBJZiBub3QgcHJvdmlkZWQsIHRoZSBmdW5jdGlvbiBhcHBlbmRzIGluc3RlYWQuXHJcblx0XHQgKiBAcGFyYW0gaW5zZXJ0IE9iamVjdCB3aXRoIHRoZSBrZXkvdmFsdWUgcGFpcnMgdG8gaW5zZXJ0XHJcblx0XHQgKiBAcGFyYW0gcm9vdCBUaGUgb2JqZWN0IHRoYXQgY29udGFpbnMgYGluc2lkZWAuIElmIGVxdWFsIHRvIFByaXNtLmxhbmd1YWdlcywgaXQgY2FuIGJlIG9taXR0ZWQuXHJcblx0XHQgKi9cclxuXHRcdGluc2VydEJlZm9yZTogZnVuY3Rpb24gKGluc2lkZSwgYmVmb3JlLCBpbnNlcnQsIHJvb3QpIHtcclxuXHRcdFx0cm9vdCA9IHJvb3QgfHwgXy5sYW5ndWFnZXM7XHJcblx0XHRcdHZhciBncmFtbWFyID0gcm9vdFtpbnNpZGVdO1xyXG5cclxuXHRcdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPT0gMikge1xyXG5cdFx0XHRcdGluc2VydCA9IGFyZ3VtZW50c1sxXTtcclxuXHJcblx0XHRcdFx0Zm9yICh2YXIgbmV3VG9rZW4gaW4gaW5zZXJ0KSB7XHJcblx0XHRcdFx0XHRpZiAoaW5zZXJ0Lmhhc093blByb3BlcnR5KG5ld1Rva2VuKSkge1xyXG5cdFx0XHRcdFx0XHRncmFtbWFyW25ld1Rva2VuXSA9IGluc2VydFtuZXdUb2tlbl07XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRyZXR1cm4gZ3JhbW1hcjtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFyIHJldCA9IHt9O1xyXG5cclxuXHRcdFx0Zm9yICh2YXIgdG9rZW4gaW4gZ3JhbW1hcikge1xyXG5cclxuXHRcdFx0XHRpZiAoZ3JhbW1hci5oYXNPd25Qcm9wZXJ0eSh0b2tlbikpIHtcclxuXHJcblx0XHRcdFx0XHRpZiAodG9rZW4gPT0gYmVmb3JlKSB7XHJcblxyXG5cdFx0XHRcdFx0XHRmb3IgKHZhciBuZXdUb2tlbiBpbiBpbnNlcnQpIHtcclxuXHJcblx0XHRcdFx0XHRcdFx0aWYgKGluc2VydC5oYXNPd25Qcm9wZXJ0eShuZXdUb2tlbikpIHtcclxuXHRcdFx0XHRcdFx0XHRcdHJldFtuZXdUb2tlbl0gPSBpbnNlcnRbbmV3VG9rZW5dO1xyXG5cdFx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdHJldFt0b2tlbl0gPSBncmFtbWFyW3Rva2VuXTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdC8vIFVwZGF0ZSByZWZlcmVuY2VzIGluIG90aGVyIGxhbmd1YWdlIGRlZmluaXRpb25zXHJcblx0XHRcdF8ubGFuZ3VhZ2VzLkRGUyhfLmxhbmd1YWdlcywgZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xyXG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gcm9vdFtpbnNpZGVdICYmIGtleSAhPSBpbnNpZGUpIHtcclxuXHRcdFx0XHRcdHRoaXNba2V5XSA9IHJldDtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdFx0cmV0dXJuIHJvb3RbaW5zaWRlXSA9IHJldDtcclxuXHRcdH0sXHJcblxyXG5cdFx0Ly8gVHJhdmVyc2UgYSBsYW5ndWFnZSBkZWZpbml0aW9uIHdpdGggRGVwdGggRmlyc3QgU2VhcmNoXHJcblx0XHRERlM6IGZ1bmN0aW9uKG8sIGNhbGxiYWNrLCB0eXBlLCB2aXNpdGVkKSB7XHJcblx0XHRcdHZpc2l0ZWQgPSB2aXNpdGVkIHx8IHt9O1xyXG5cdFx0XHRmb3IgKHZhciBpIGluIG8pIHtcclxuXHRcdFx0XHRpZiAoby5oYXNPd25Qcm9wZXJ0eShpKSkge1xyXG5cdFx0XHRcdFx0Y2FsbGJhY2suY2FsbChvLCBpLCBvW2ldLCB0eXBlIHx8IGkpO1xyXG5cclxuXHRcdFx0XHRcdGlmIChfLnV0aWwudHlwZShvW2ldKSA9PT0gJ09iamVjdCcgJiYgIXZpc2l0ZWRbXy51dGlsLm9iaklkKG9baV0pXSkge1xyXG5cdFx0XHRcdFx0XHR2aXNpdGVkW18udXRpbC5vYmpJZChvW2ldKV0gPSB0cnVlO1xyXG5cdFx0XHRcdFx0XHRfLmxhbmd1YWdlcy5ERlMob1tpXSwgY2FsbGJhY2ssIG51bGwsIHZpc2l0ZWQpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSBpZiAoXy51dGlsLnR5cGUob1tpXSkgPT09ICdBcnJheScgJiYgIXZpc2l0ZWRbXy51dGlsLm9iaklkKG9baV0pXSkge1xyXG5cdFx0XHRcdFx0XHR2aXNpdGVkW18udXRpbC5vYmpJZChvW2ldKV0gPSB0cnVlO1xyXG5cdFx0XHRcdFx0XHRfLmxhbmd1YWdlcy5ERlMob1tpXSwgY2FsbGJhY2ssIGksIHZpc2l0ZWQpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0sXHJcblx0cGx1Z2luczoge30sXHJcblxyXG5cdGhpZ2hsaWdodEFsbDogZnVuY3Rpb24oYXN5bmMsIGNhbGxiYWNrKSB7XHJcblx0XHR2YXIgZW52ID0ge1xyXG5cdFx0XHRjYWxsYmFjazogY2FsbGJhY2ssXHJcblx0XHRcdHNlbGVjdG9yOiAnY29kZVtjbGFzcyo9XCJsYW5ndWFnZS1cIl0sIFtjbGFzcyo9XCJsYW5ndWFnZS1cIl0gY29kZSwgY29kZVtjbGFzcyo9XCJsYW5nLVwiXSwgW2NsYXNzKj1cImxhbmctXCJdIGNvZGUnXHJcblx0XHR9O1xyXG5cclxuXHRcdF8uaG9va3MucnVuKFwiYmVmb3JlLWhpZ2hsaWdodGFsbFwiLCBlbnYpO1xyXG5cclxuXHRcdHZhciBlbGVtZW50cyA9IGVudi5lbGVtZW50cyB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGVudi5zZWxlY3Rvcik7XHJcblxyXG5cdFx0Zm9yICh2YXIgaT0wLCBlbGVtZW50OyBlbGVtZW50ID0gZWxlbWVudHNbaSsrXTspIHtcclxuXHRcdFx0Xy5oaWdobGlnaHRFbGVtZW50KGVsZW1lbnQsIGFzeW5jID09PSB0cnVlLCBlbnYuY2FsbGJhY2spO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGhpZ2hsaWdodEVsZW1lbnQ6IGZ1bmN0aW9uKGVsZW1lbnQsIGFzeW5jLCBjYWxsYmFjaykge1xyXG5cdFx0Ly8gRmluZCBsYW5ndWFnZVxyXG5cdFx0dmFyIGxhbmd1YWdlLCBncmFtbWFyLCBwYXJlbnQgPSBlbGVtZW50O1xyXG5cclxuXHRcdHdoaWxlIChwYXJlbnQgJiYgIWxhbmcudGVzdChwYXJlbnQuY2xhc3NOYW1lKSkge1xyXG5cdFx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50Tm9kZTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAocGFyZW50KSB7XHJcblx0XHRcdGxhbmd1YWdlID0gKHBhcmVudC5jbGFzc05hbWUubWF0Y2gobGFuZykgfHwgWywnJ10pWzFdLnRvTG93ZXJDYXNlKCk7XHJcblx0XHRcdGdyYW1tYXIgPSBfLmxhbmd1YWdlc1tsYW5ndWFnZV07XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gU2V0IGxhbmd1YWdlIG9uIHRoZSBlbGVtZW50LCBpZiBub3QgcHJlc2VudFxyXG5cdFx0ZWxlbWVudC5jbGFzc05hbWUgPSBlbGVtZW50LmNsYXNzTmFtZS5yZXBsYWNlKGxhbmcsICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykgKyAnIGxhbmd1YWdlLScgKyBsYW5ndWFnZTtcclxuXHJcblx0XHQvLyBTZXQgbGFuZ3VhZ2Ugb24gdGhlIHBhcmVudCwgZm9yIHN0eWxpbmdcclxuXHRcdHBhcmVudCA9IGVsZW1lbnQucGFyZW50Tm9kZTtcclxuXHJcblx0XHRpZiAoL3ByZS9pLnRlc3QocGFyZW50Lm5vZGVOYW1lKSkge1xyXG5cdFx0XHRwYXJlbnQuY2xhc3NOYW1lID0gcGFyZW50LmNsYXNzTmFtZS5yZXBsYWNlKGxhbmcsICcnKS5yZXBsYWNlKC9cXHMrL2csICcgJykgKyAnIGxhbmd1YWdlLScgKyBsYW5ndWFnZTtcclxuXHRcdH1cclxuXHJcblx0XHR2YXIgY29kZSA9IGVsZW1lbnQudGV4dENvbnRlbnQ7XHJcblxyXG5cdFx0dmFyIGVudiA9IHtcclxuXHRcdFx0ZWxlbWVudDogZWxlbWVudCxcclxuXHRcdFx0bGFuZ3VhZ2U6IGxhbmd1YWdlLFxyXG5cdFx0XHRncmFtbWFyOiBncmFtbWFyLFxyXG5cdFx0XHRjb2RlOiBjb2RlXHJcblx0XHR9O1xyXG5cclxuXHRcdF8uaG9va3MucnVuKCdiZWZvcmUtc2FuaXR5LWNoZWNrJywgZW52KTtcclxuXHJcblx0XHRpZiAoIWVudi5jb2RlIHx8ICFlbnYuZ3JhbW1hcikge1xyXG5cdFx0XHRfLmhvb2tzLnJ1bignY29tcGxldGUnLCBlbnYpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0Xy5ob29rcy5ydW4oJ2JlZm9yZS1oaWdobGlnaHQnLCBlbnYpO1xyXG5cclxuXHRcdGlmIChhc3luYyAmJiBfc2VsZi5Xb3JrZXIpIHtcclxuXHRcdFx0dmFyIHdvcmtlciA9IG5ldyBXb3JrZXIoXy5maWxlbmFtZSk7XHJcblxyXG5cdFx0XHR3b3JrZXIub25tZXNzYWdlID0gZnVuY3Rpb24oZXZ0KSB7XHJcblx0XHRcdFx0ZW52LmhpZ2hsaWdodGVkQ29kZSA9IGV2dC5kYXRhO1xyXG5cclxuXHRcdFx0XHRfLmhvb2tzLnJ1bignYmVmb3JlLWluc2VydCcsIGVudik7XHJcblxyXG5cdFx0XHRcdGVudi5lbGVtZW50LmlubmVySFRNTCA9IGVudi5oaWdobGlnaHRlZENvZGU7XHJcblxyXG5cdFx0XHRcdGNhbGxiYWNrICYmIGNhbGxiYWNrLmNhbGwoZW52LmVsZW1lbnQpO1xyXG5cdFx0XHRcdF8uaG9va3MucnVuKCdhZnRlci1oaWdobGlnaHQnLCBlbnYpO1xyXG5cdFx0XHRcdF8uaG9va3MucnVuKCdjb21wbGV0ZScsIGVudik7XHJcblx0XHRcdH07XHJcblxyXG5cdFx0XHR3b3JrZXIucG9zdE1lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoe1xyXG5cdFx0XHRcdGxhbmd1YWdlOiBlbnYubGFuZ3VhZ2UsXHJcblx0XHRcdFx0Y29kZTogZW52LmNvZGUsXHJcblx0XHRcdFx0aW1tZWRpYXRlQ2xvc2U6IHRydWVcclxuXHRcdFx0fSkpO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGVudi5oaWdobGlnaHRlZENvZGUgPSBfLmhpZ2hsaWdodChlbnYuY29kZSwgZW52LmdyYW1tYXIsIGVudi5sYW5ndWFnZSk7XHJcblxyXG5cdFx0XHRfLmhvb2tzLnJ1bignYmVmb3JlLWluc2VydCcsIGVudik7XHJcblxyXG5cdFx0XHRlbnYuZWxlbWVudC5pbm5lckhUTUwgPSBlbnYuaGlnaGxpZ2h0ZWRDb2RlO1xyXG5cclxuXHRcdFx0Y2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbChlbGVtZW50KTtcclxuXHJcblx0XHRcdF8uaG9va3MucnVuKCdhZnRlci1oaWdobGlnaHQnLCBlbnYpO1xyXG5cdFx0XHRfLmhvb2tzLnJ1bignY29tcGxldGUnLCBlbnYpO1xyXG5cdFx0fVxyXG5cdH0sXHJcblxyXG5cdGhpZ2hsaWdodDogZnVuY3Rpb24gKHRleHQsIGdyYW1tYXIsIGxhbmd1YWdlKSB7XHJcblx0XHR2YXIgdG9rZW5zID0gXy50b2tlbml6ZSh0ZXh0LCBncmFtbWFyKTtcclxuXHRcdHJldHVybiBUb2tlbi5zdHJpbmdpZnkoXy51dGlsLmVuY29kZSh0b2tlbnMpLCBsYW5ndWFnZSk7XHJcblx0fSxcclxuXHJcblx0dG9rZW5pemU6IGZ1bmN0aW9uKHRleHQsIGdyYW1tYXIsIGxhbmd1YWdlKSB7XHJcblx0XHR2YXIgVG9rZW4gPSBfLlRva2VuO1xyXG5cclxuXHRcdHZhciBzdHJhcnIgPSBbdGV4dF07XHJcblxyXG5cdFx0dmFyIHJlc3QgPSBncmFtbWFyLnJlc3Q7XHJcblxyXG5cdFx0aWYgKHJlc3QpIHtcclxuXHRcdFx0Zm9yICh2YXIgdG9rZW4gaW4gcmVzdCkge1xyXG5cdFx0XHRcdGdyYW1tYXJbdG9rZW5dID0gcmVzdFt0b2tlbl07XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdGRlbGV0ZSBncmFtbWFyLnJlc3Q7XHJcblx0XHR9XHJcblxyXG5cdFx0dG9rZW5sb29wOiBmb3IgKHZhciB0b2tlbiBpbiBncmFtbWFyKSB7XHJcblx0XHRcdGlmKCFncmFtbWFyLmhhc093blByb3BlcnR5KHRva2VuKSB8fCAhZ3JhbW1hclt0b2tlbl0pIHtcclxuXHRcdFx0XHRjb250aW51ZTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0dmFyIHBhdHRlcm5zID0gZ3JhbW1hclt0b2tlbl07XHJcblx0XHRcdHBhdHRlcm5zID0gKF8udXRpbC50eXBlKHBhdHRlcm5zKSA9PT0gXCJBcnJheVwiKSA/IHBhdHRlcm5zIDogW3BhdHRlcm5zXTtcclxuXHJcblx0XHRcdGZvciAodmFyIGogPSAwOyBqIDwgcGF0dGVybnMubGVuZ3RoOyArK2opIHtcclxuXHRcdFx0XHR2YXIgcGF0dGVybiA9IHBhdHRlcm5zW2pdLFxyXG5cdFx0XHRcdFx0aW5zaWRlID0gcGF0dGVybi5pbnNpZGUsXHJcblx0XHRcdFx0XHRsb29rYmVoaW5kID0gISFwYXR0ZXJuLmxvb2tiZWhpbmQsXHJcblx0XHRcdFx0XHRncmVlZHkgPSAhIXBhdHRlcm4uZ3JlZWR5LFxyXG5cdFx0XHRcdFx0bG9va2JlaGluZExlbmd0aCA9IDAsXHJcblx0XHRcdFx0XHRhbGlhcyA9IHBhdHRlcm4uYWxpYXM7XHJcblxyXG5cdFx0XHRcdHBhdHRlcm4gPSBwYXR0ZXJuLnBhdHRlcm4gfHwgcGF0dGVybjtcclxuXHJcblx0XHRcdFx0Zm9yICh2YXIgaT0wOyBpPHN0cmFyci5sZW5ndGg7IGkrKykgeyAvLyBEb27igJl0IGNhY2hlIGxlbmd0aCBhcyBpdCBjaGFuZ2VzIGR1cmluZyB0aGUgbG9vcFxyXG5cclxuXHRcdFx0XHRcdHZhciBzdHIgPSBzdHJhcnJbaV07XHJcblxyXG5cdFx0XHRcdFx0aWYgKHN0cmFyci5sZW5ndGggPiB0ZXh0Lmxlbmd0aCkge1xyXG5cdFx0XHRcdFx0XHQvLyBTb21ldGhpbmcgd2VudCB0ZXJyaWJseSB3cm9uZywgQUJPUlQsIEFCT1JUIVxyXG5cdFx0XHRcdFx0XHRicmVhayB0b2tlbmxvb3A7XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0aWYgKHN0ciBpbnN0YW5jZW9mIFRva2VuKSB7XHJcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdHBhdHRlcm4ubGFzdEluZGV4ID0gMDtcclxuXHJcblx0XHRcdFx0XHR2YXIgbWF0Y2ggPSBwYXR0ZXJuLmV4ZWMoc3RyKSxcclxuXHRcdFx0XHRcdCAgICBkZWxOdW0gPSAxO1xyXG5cclxuXHRcdFx0XHRcdC8vIEdyZWVkeSBwYXR0ZXJucyBjYW4gb3ZlcnJpZGUvcmVtb3ZlIHVwIHRvIHR3byBwcmV2aW91c2x5IG1hdGNoZWQgdG9rZW5zXHJcblx0XHRcdFx0XHRpZiAoIW1hdGNoICYmIGdyZWVkeSAmJiBpICE9IHN0cmFyci5sZW5ndGggLSAxKSB7XHJcblx0XHRcdFx0XHRcdC8vIFJlY29uc3RydWN0IHRoZSBvcmlnaW5hbCB0ZXh0IHVzaW5nIHRoZSBuZXh0IHR3byB0b2tlbnNcclxuXHRcdFx0XHRcdFx0dmFyIG5leHRUb2tlbiA9IHN0cmFycltpICsgMV0ubWF0Y2hlZFN0ciB8fCBzdHJhcnJbaSArIDFdLFxyXG5cdFx0XHRcdFx0XHQgICAgY29tYlN0ciA9IHN0ciArIG5leHRUb2tlbjtcclxuXHJcblx0XHRcdFx0XHRcdGlmIChpIDwgc3RyYXJyLmxlbmd0aCAtIDIpIHtcclxuXHRcdFx0XHRcdFx0XHRjb21iU3RyICs9IHN0cmFycltpICsgMl0ubWF0Y2hlZFN0ciB8fCBzdHJhcnJbaSArIDJdO1xyXG5cdFx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0XHQvLyBUcnkgdGhlIHBhdHRlcm4gYWdhaW4gb24gdGhlIHJlY29uc3RydWN0ZWQgdGV4dFxyXG5cdFx0XHRcdFx0XHRwYXR0ZXJuLmxhc3RJbmRleCA9IDA7XHJcblx0XHRcdFx0XHRcdG1hdGNoID0gcGF0dGVybi5leGVjKGNvbWJTdHIpO1xyXG5cdFx0XHRcdFx0XHRpZiAoIW1hdGNoKSB7XHJcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRcdHZhciBmcm9tID0gbWF0Y2guaW5kZXggKyAobG9va2JlaGluZCA/IG1hdGNoWzFdLmxlbmd0aCA6IDApO1xyXG5cdFx0XHRcdFx0XHQvLyBUbyBiZSBhIHZhbGlkIGNhbmRpZGF0ZSwgdGhlIG5ldyBtYXRjaCBoYXMgdG8gc3RhcnQgaW5zaWRlIG9mIHN0clxyXG5cdFx0XHRcdFx0XHRpZiAoZnJvbSA+PSBzdHIubGVuZ3RoKSB7XHJcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0dmFyIHRvID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgsXHJcblx0XHRcdFx0XHRcdCAgICBsZW4gPSBzdHIubGVuZ3RoICsgbmV4dFRva2VuLmxlbmd0aDtcclxuXHJcblx0XHRcdFx0XHRcdC8vIE51bWJlciBvZiB0b2tlbnMgdG8gZGVsZXRlIGFuZCByZXBsYWNlIHdpdGggdGhlIG5ldyBtYXRjaFxyXG5cdFx0XHRcdFx0XHRkZWxOdW0gPSAzO1xyXG5cclxuXHRcdFx0XHRcdFx0aWYgKHRvIDw9IGxlbikge1xyXG5cdFx0XHRcdFx0XHRcdGlmIChzdHJhcnJbaSArIDFdLmdyZWVkeSkge1xyXG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRcdGRlbE51bSA9IDI7XHJcblx0XHRcdFx0XHRcdFx0Y29tYlN0ciA9IGNvbWJTdHIuc2xpY2UoMCwgbGVuKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRzdHIgPSBjb21iU3RyO1xyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdGlmICghbWF0Y2gpIHtcclxuXHRcdFx0XHRcdFx0Y29udGludWU7XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0aWYobG9va2JlaGluZCkge1xyXG5cdFx0XHRcdFx0XHRsb29rYmVoaW5kTGVuZ3RoID0gbWF0Y2hbMV0ubGVuZ3RoO1xyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdHZhciBmcm9tID0gbWF0Y2guaW5kZXggKyBsb29rYmVoaW5kTGVuZ3RoLFxyXG5cdFx0XHRcdFx0ICAgIG1hdGNoID0gbWF0Y2hbMF0uc2xpY2UobG9va2JlaGluZExlbmd0aCksXHJcblx0XHRcdFx0XHQgICAgdG8gPSBmcm9tICsgbWF0Y2gubGVuZ3RoLFxyXG5cdFx0XHRcdFx0ICAgIGJlZm9yZSA9IHN0ci5zbGljZSgwLCBmcm9tKSxcclxuXHRcdFx0XHRcdCAgICBhZnRlciA9IHN0ci5zbGljZSh0byk7XHJcblxyXG5cdFx0XHRcdFx0dmFyIGFyZ3MgPSBbaSwgZGVsTnVtXTtcclxuXHJcblx0XHRcdFx0XHRpZiAoYmVmb3JlKSB7XHJcblx0XHRcdFx0XHRcdGFyZ3MucHVzaChiZWZvcmUpO1xyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdHZhciB3cmFwcGVkID0gbmV3IFRva2VuKHRva2VuLCBpbnNpZGU/IF8udG9rZW5pemUobWF0Y2gsIGluc2lkZSkgOiBtYXRjaCwgYWxpYXMsIG1hdGNoLCBncmVlZHkpO1xyXG5cclxuXHRcdFx0XHRcdGFyZ3MucHVzaCh3cmFwcGVkKTtcclxuXHJcblx0XHRcdFx0XHRpZiAoYWZ0ZXIpIHtcclxuXHRcdFx0XHRcdFx0YXJncy5wdXNoKGFmdGVyKTtcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRBcnJheS5wcm90b3R5cGUuc3BsaWNlLmFwcGx5KHN0cmFyciwgYXJncyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHN0cmFycjtcclxuXHR9LFxyXG5cclxuXHRob29rczoge1xyXG5cdFx0YWxsOiB7fSxcclxuXHJcblx0XHRhZGQ6IGZ1bmN0aW9uIChuYW1lLCBjYWxsYmFjaykge1xyXG5cdFx0XHR2YXIgaG9va3MgPSBfLmhvb2tzLmFsbDtcclxuXHJcblx0XHRcdGhvb2tzW25hbWVdID0gaG9va3NbbmFtZV0gfHwgW107XHJcblxyXG5cdFx0XHRob29rc1tuYW1lXS5wdXNoKGNhbGxiYWNrKTtcclxuXHRcdH0sXHJcblxyXG5cdFx0cnVuOiBmdW5jdGlvbiAobmFtZSwgZW52KSB7XHJcblx0XHRcdHZhciBjYWxsYmFja3MgPSBfLmhvb2tzLmFsbFtuYW1lXTtcclxuXHJcblx0XHRcdGlmICghY2FsbGJhY2tzIHx8ICFjYWxsYmFja3MubGVuZ3RoKSB7XHJcblx0XHRcdFx0cmV0dXJuO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRmb3IgKHZhciBpPTAsIGNhbGxiYWNrOyBjYWxsYmFjayA9IGNhbGxiYWNrc1tpKytdOykge1xyXG5cdFx0XHRcdGNhbGxiYWNrKGVudik7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9XHJcbn07XHJcblxyXG52YXIgVG9rZW4gPSBfLlRva2VuID0gZnVuY3Rpb24odHlwZSwgY29udGVudCwgYWxpYXMsIG1hdGNoZWRTdHIsIGdyZWVkeSkge1xyXG5cdHRoaXMudHlwZSA9IHR5cGU7XHJcblx0dGhpcy5jb250ZW50ID0gY29udGVudDtcclxuXHR0aGlzLmFsaWFzID0gYWxpYXM7XHJcblx0Ly8gQ29weSBvZiB0aGUgZnVsbCBzdHJpbmcgdGhpcyB0b2tlbiB3YXMgY3JlYXRlZCBmcm9tXHJcblx0dGhpcy5tYXRjaGVkU3RyID0gbWF0Y2hlZFN0ciB8fCBudWxsO1xyXG5cdHRoaXMuZ3JlZWR5ID0gISFncmVlZHk7XHJcbn07XHJcblxyXG5Ub2tlbi5zdHJpbmdpZnkgPSBmdW5jdGlvbihvLCBsYW5ndWFnZSwgcGFyZW50KSB7XHJcblx0aWYgKHR5cGVvZiBvID09ICdzdHJpbmcnKSB7XHJcblx0XHRyZXR1cm4gbztcclxuXHR9XHJcblxyXG5cdGlmIChfLnV0aWwudHlwZShvKSA9PT0gJ0FycmF5Jykge1xyXG5cdFx0cmV0dXJuIG8ubWFwKGZ1bmN0aW9uKGVsZW1lbnQpIHtcclxuXHRcdFx0cmV0dXJuIFRva2VuLnN0cmluZ2lmeShlbGVtZW50LCBsYW5ndWFnZSwgbyk7XHJcblx0XHR9KS5qb2luKCcnKTtcclxuXHR9XHJcblxyXG5cdHZhciBlbnYgPSB7XHJcblx0XHR0eXBlOiBvLnR5cGUsXHJcblx0XHRjb250ZW50OiBUb2tlbi5zdHJpbmdpZnkoby5jb250ZW50LCBsYW5ndWFnZSwgcGFyZW50KSxcclxuXHRcdHRhZzogJ3NwYW4nLFxyXG5cdFx0Y2xhc3NlczogWyd0b2tlbicsIG8udHlwZV0sXHJcblx0XHRhdHRyaWJ1dGVzOiB7fSxcclxuXHRcdGxhbmd1YWdlOiBsYW5ndWFnZSxcclxuXHRcdHBhcmVudDogcGFyZW50XHJcblx0fTtcclxuXHJcblx0aWYgKGVudi50eXBlID09ICdjb21tZW50Jykge1xyXG5cdFx0ZW52LmF0dHJpYnV0ZXNbJ3NwZWxsY2hlY2snXSA9ICd0cnVlJztcclxuXHR9XHJcblxyXG5cdGlmIChvLmFsaWFzKSB7XHJcblx0XHR2YXIgYWxpYXNlcyA9IF8udXRpbC50eXBlKG8uYWxpYXMpID09PSAnQXJyYXknID8gby5hbGlhcyA6IFtvLmFsaWFzXTtcclxuXHRcdEFycmF5LnByb3RvdHlwZS5wdXNoLmFwcGx5KGVudi5jbGFzc2VzLCBhbGlhc2VzKTtcclxuXHR9XHJcblxyXG5cdF8uaG9va3MucnVuKCd3cmFwJywgZW52KTtcclxuXHJcblx0dmFyIGF0dHJpYnV0ZXMgPSAnJztcclxuXHJcblx0Zm9yICh2YXIgbmFtZSBpbiBlbnYuYXR0cmlidXRlcykge1xyXG5cdFx0YXR0cmlidXRlcyArPSAoYXR0cmlidXRlcyA/ICcgJyA6ICcnKSArIG5hbWUgKyAnPVwiJyArIChlbnYuYXR0cmlidXRlc1tuYW1lXSB8fCAnJykgKyAnXCInO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuICc8JyArIGVudi50YWcgKyAnIGNsYXNzPVwiJyArIGVudi5jbGFzc2VzLmpvaW4oJyAnKSArICdcIiAnICsgYXR0cmlidXRlcyArICc+JyArIGVudi5jb250ZW50ICsgJzwvJyArIGVudi50YWcgKyAnPic7XHJcblxyXG59O1xyXG5cclxuaWYgKCFfc2VsZi5kb2N1bWVudCkge1xyXG5cdGlmICghX3NlbGYuYWRkRXZlbnRMaXN0ZW5lcikge1xyXG5cdFx0Ly8gaW4gTm9kZS5qc1xyXG5cdFx0cmV0dXJuIF9zZWxmLlByaXNtO1xyXG5cdH1cclxuIFx0Ly8gSW4gd29ya2VyXHJcblx0X3NlbGYuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uKGV2dCkge1xyXG5cdFx0dmFyIG1lc3NhZ2UgPSBKU09OLnBhcnNlKGV2dC5kYXRhKSxcclxuXHRcdCAgICBsYW5nID0gbWVzc2FnZS5sYW5ndWFnZSxcclxuXHRcdCAgICBjb2RlID0gbWVzc2FnZS5jb2RlLFxyXG5cdFx0ICAgIGltbWVkaWF0ZUNsb3NlID0gbWVzc2FnZS5pbW1lZGlhdGVDbG9zZTtcclxuXHJcblx0XHRfc2VsZi5wb3N0TWVzc2FnZShfLmhpZ2hsaWdodChjb2RlLCBfLmxhbmd1YWdlc1tsYW5nXSwgbGFuZykpO1xyXG5cdFx0aWYgKGltbWVkaWF0ZUNsb3NlKSB7XHJcblx0XHRcdF9zZWxmLmNsb3NlKCk7XHJcblx0XHR9XHJcblx0fSwgZmFsc2UpO1xyXG5cclxuXHRyZXR1cm4gX3NlbGYuUHJpc207XHJcbn1cclxuXHJcbi8vR2V0IGN1cnJlbnQgc2NyaXB0IGFuZCBoaWdobGlnaHRcclxudmFyIHNjcmlwdCA9IGRvY3VtZW50LmN1cnJlbnRTY3JpcHQgfHwgW10uc2xpY2UuY2FsbChkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKSkucG9wKCk7XHJcblxyXG5pZiAoc2NyaXB0KSB7XHJcblx0Xy5maWxlbmFtZSA9IHNjcmlwdC5zcmM7XHJcblxyXG5cdGlmIChkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyICYmICFzY3JpcHQuaGFzQXR0cmlidXRlKCdkYXRhLW1hbnVhbCcpKSB7XHJcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgXy5oaWdobGlnaHRBbGwpO1xyXG5cdH1cclxufVxyXG5cclxucmV0dXJuIF9zZWxmLlByaXNtO1xyXG5cclxufSkoKTtcclxuXHJcbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xyXG5cdG1vZHVsZS5leHBvcnRzID0gUHJpc207XHJcbn1cclxuXHJcbi8vIGhhY2sgZm9yIGNvbXBvbmVudHMgdG8gd29yayBjb3JyZWN0bHkgaW4gbm9kZS5qc1xyXG5pZiAodHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcclxuXHRnbG9iYWwuUHJpc20gPSBQcmlzbTtcclxufVxyXG5cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1tYXJrdXAuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cCA9IHtcclxuXHQnY29tbWVudCc6IC88IS0tW1xcd1xcV10qPy0tPi8sXHJcblx0J3Byb2xvZyc6IC88XFw/W1xcd1xcV10rP1xcPz4vLFxyXG5cdCdkb2N0eXBlJzogLzwhRE9DVFlQRVtcXHdcXFddKz8+LyxcclxuXHQnY2RhdGEnOiAvPCFcXFtDREFUQVxcW1tcXHdcXFddKj9dXT4vaSxcclxuXHQndGFnJzoge1xyXG5cdFx0cGF0dGVybjogLzxcXC8/KD8hXFxkKVteXFxzPlxcLz0uJDxdKyg/OlxccytbXlxccz5cXC89XSsoPzo9KD86KFwifCcpKD86XFxcXFxcMXxcXFxcPyg/IVxcMSlbXFx3XFxXXSkqXFwxfFteXFxzJ1wiPj1dKykpPykqXFxzKlxcLz8+L2ksXHJcblx0XHRpbnNpZGU6IHtcclxuXHRcdFx0J3RhZyc6IHtcclxuXHRcdFx0XHRwYXR0ZXJuOiAvXjxcXC8/W15cXHM+XFwvXSsvaSxcclxuXHRcdFx0XHRpbnNpZGU6IHtcclxuXHRcdFx0XHRcdCdwdW5jdHVhdGlvbic6IC9ePFxcLz8vLFxyXG5cdFx0XHRcdFx0J25hbWVzcGFjZSc6IC9eW15cXHM+XFwvOl0rOi9cclxuXHRcdFx0XHR9XHJcblx0XHRcdH0sXHJcblx0XHRcdCdhdHRyLXZhbHVlJzoge1xyXG5cdFx0XHRcdHBhdHRlcm46IC89KD86KCd8XCIpW1xcd1xcV10qPyhcXDEpfFteXFxzPl0rKS9pLFxyXG5cdFx0XHRcdGluc2lkZToge1xyXG5cdFx0XHRcdFx0J3B1bmN0dWF0aW9uJzogL1s9PlwiJ10vXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9LFxyXG5cdFx0XHQncHVuY3R1YXRpb24nOiAvXFwvPz4vLFxyXG5cdFx0XHQnYXR0ci1uYW1lJzoge1xyXG5cdFx0XHRcdHBhdHRlcm46IC9bXlxccz5cXC9dKy8sXHJcblx0XHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0XHQnbmFtZXNwYWNlJzogL15bXlxccz5cXC86XSs6L1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cclxuXHRcdH1cclxuXHR9LFxyXG5cdCdlbnRpdHknOiAvJiM/W1xcZGEtel17MSw4fTsvaVxyXG59O1xyXG5cclxuLy8gUGx1Z2luIHRvIG1ha2UgZW50aXR5IHRpdGxlIHNob3cgdGhlIHJlYWwgZW50aXR5LCBpZGVhIGJ5IFJvbWFuIEtvbWFyb3ZcclxuUHJpc20uaG9va3MuYWRkKCd3cmFwJywgZnVuY3Rpb24oZW52KSB7XHJcblxyXG5cdGlmIChlbnYudHlwZSA9PT0gJ2VudGl0eScpIHtcclxuXHRcdGVudi5hdHRyaWJ1dGVzWyd0aXRsZSddID0gZW52LmNvbnRlbnQucmVwbGFjZSgvJmFtcDsvLCAnJicpO1xyXG5cdH1cclxufSk7XHJcblxyXG5QcmlzbS5sYW5ndWFnZXMueG1sID0gUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cDtcclxuUHJpc20ubGFuZ3VhZ2VzLmh0bWwgPSBQcmlzbS5sYW5ndWFnZXMubWFya3VwO1xyXG5QcmlzbS5sYW5ndWFnZXMubWF0aG1sID0gUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cDtcclxuUHJpc20ubGFuZ3VhZ2VzLnN2ZyA9IFByaXNtLmxhbmd1YWdlcy5tYXJrdXA7XHJcblxyXG5cclxuLyogKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gICAgIEJlZ2luIHByaXNtLWNzcy5qc1xyXG4qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqICovXHJcblxyXG5QcmlzbS5sYW5ndWFnZXMuY3NzID0ge1xyXG5cdCdjb21tZW50JzogL1xcL1xcKltcXHdcXFddKj9cXCpcXC8vLFxyXG5cdCdhdHJ1bGUnOiB7XHJcblx0XHRwYXR0ZXJuOiAvQFtcXHctXSs/Lio/KDt8KD89XFxzKlxceykpL2ksXHJcblx0XHRpbnNpZGU6IHtcclxuXHRcdFx0J3J1bGUnOiAvQFtcXHctXSsvXHJcblx0XHRcdC8vIFNlZSByZXN0IGJlbG93XHJcblx0XHR9XHJcblx0fSxcclxuXHQndXJsJzogL3VybFxcKCg/OihbXCInXSkoXFxcXCg/OlxcclxcbnxbXFx3XFxXXSl8KD8hXFwxKVteXFxcXFxcclxcbl0pKlxcMXwuKj8pXFwpL2ksXHJcblx0J3NlbGVjdG9yJzogL1teXFx7XFx9XFxzXVteXFx7XFx9O10qPyg/PVxccypcXHspLyxcclxuXHQnc3RyaW5nJzogLyhcInwnKShcXFxcKD86XFxyXFxufFtcXHdcXFddKXwoPyFcXDEpW15cXFxcXFxyXFxuXSkqXFwxLyxcclxuXHQncHJvcGVydHknOiAvKFxcYnxcXEIpW1xcdy1dKyg/PVxccyo6KS9pLFxyXG5cdCdpbXBvcnRhbnQnOiAvXFxCIWltcG9ydGFudFxcYi9pLFxyXG5cdCdmdW5jdGlvbic6IC9bLWEtejAtOV0rKD89XFwoKS9pLFxyXG5cdCdwdW5jdHVhdGlvbic6IC9bKCl7fTs6XS9cclxufTtcclxuXHJcblByaXNtLmxhbmd1YWdlcy5jc3NbJ2F0cnVsZSddLmluc2lkZS5yZXN0ID0gUHJpc20udXRpbC5jbG9uZShQcmlzbS5sYW5ndWFnZXMuY3NzKTtcclxuXHJcbmlmIChQcmlzbS5sYW5ndWFnZXMubWFya3VwKSB7XHJcblx0UHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnbWFya3VwJywgJ3RhZycsIHtcclxuXHRcdCdzdHlsZSc6IHtcclxuXHRcdFx0cGF0dGVybjogLyg8c3R5bGVbXFx3XFxXXSo/PilbXFx3XFxXXSo/KD89PFxcL3N0eWxlPikvaSxcclxuXHRcdFx0bG9va2JlaGluZDogdHJ1ZSxcclxuXHRcdFx0aW5zaWRlOiBQcmlzbS5sYW5ndWFnZXMuY3NzLFxyXG5cdFx0XHRhbGlhczogJ2xhbmd1YWdlLWNzcydcclxuXHRcdH1cclxuXHR9KTtcclxuXHRcclxuXHRQcmlzbS5sYW5ndWFnZXMuaW5zZXJ0QmVmb3JlKCdpbnNpZGUnLCAnYXR0ci12YWx1ZScsIHtcclxuXHRcdCdzdHlsZS1hdHRyJzoge1xyXG5cdFx0XHRwYXR0ZXJuOiAvXFxzKnN0eWxlPShcInwnKS4qP1xcMS9pLFxyXG5cdFx0XHRpbnNpZGU6IHtcclxuXHRcdFx0XHQnYXR0ci1uYW1lJzoge1xyXG5cdFx0XHRcdFx0cGF0dGVybjogL15cXHMqc3R5bGUvaSxcclxuXHRcdFx0XHRcdGluc2lkZTogUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cC50YWcuaW5zaWRlXHJcblx0XHRcdFx0fSxcclxuXHRcdFx0XHQncHVuY3R1YXRpb24nOiAvXlxccyo9XFxzKlsnXCJdfFsnXCJdXFxzKiQvLFxyXG5cdFx0XHRcdCdhdHRyLXZhbHVlJzoge1xyXG5cdFx0XHRcdFx0cGF0dGVybjogLy4rL2ksXHJcblx0XHRcdFx0XHRpbnNpZGU6IFByaXNtLmxhbmd1YWdlcy5jc3NcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0sXHJcblx0XHRcdGFsaWFzOiAnbGFuZ3VhZ2UtY3NzJ1xyXG5cdFx0fVxyXG5cdH0sIFByaXNtLmxhbmd1YWdlcy5tYXJrdXAudGFnKTtcclxufVxyXG5cclxuLyogKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gICAgIEJlZ2luIHByaXNtLWNsaWtlLmpzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuXHJcblByaXNtLmxhbmd1YWdlcy5jbGlrZSA9IHtcclxuXHQnY29tbWVudCc6IFtcclxuXHRcdHtcclxuXHRcdFx0cGF0dGVybjogLyhefFteXFxcXF0pXFwvXFwqW1xcd1xcV10qP1xcKlxcLy8sXHJcblx0XHRcdGxvb2tiZWhpbmQ6IHRydWVcclxuXHRcdH0sXHJcblx0XHR7XHJcblx0XHRcdHBhdHRlcm46IC8oXnxbXlxcXFw6XSlcXC9cXC8uKi8sXHJcblx0XHRcdGxvb2tiZWhpbmQ6IHRydWVcclxuXHRcdH1cclxuXHRdLFxyXG5cdCdzdHJpbmcnOiB7XHJcblx0XHRwYXR0ZXJuOiAvKFtcIiddKShcXFxcKD86XFxyXFxufFtcXHNcXFNdKXwoPyFcXDEpW15cXFxcXFxyXFxuXSkqXFwxLyxcclxuXHRcdGdyZWVkeTogdHJ1ZVxyXG5cdH0sXHJcblx0J2NsYXNzLW5hbWUnOiB7XHJcblx0XHRwYXR0ZXJuOiAvKCg/OlxcYig/OmNsYXNzfGludGVyZmFjZXxleHRlbmRzfGltcGxlbWVudHN8dHJhaXR8aW5zdGFuY2VvZnxuZXcpXFxzKyl8KD86Y2F0Y2hcXHMrXFwoKSlbYS16MC05X1xcLlxcXFxdKy9pLFxyXG5cdFx0bG9va2JlaGluZDogdHJ1ZSxcclxuXHRcdGluc2lkZToge1xyXG5cdFx0XHRwdW5jdHVhdGlvbjogLyhcXC58XFxcXCkvXHJcblx0XHR9XHJcblx0fSxcclxuXHQna2V5d29yZCc6IC9cXGIoaWZ8ZWxzZXx3aGlsZXxkb3xmb3J8cmV0dXJufGlufGluc3RhbmNlb2Z8ZnVuY3Rpb258bmV3fHRyeXx0aHJvd3xjYXRjaHxmaW5hbGx5fG51bGx8YnJlYWt8Y29udGludWUpXFxiLyxcclxuXHQnYm9vbGVhbic6IC9cXGIodHJ1ZXxmYWxzZSlcXGIvLFxyXG5cdCdmdW5jdGlvbic6IC9bYS16MC05X10rKD89XFwoKS9pLFxyXG5cdCdudW1iZXInOiAvXFxiLT8oPzoweFtcXGRhLWZdK3xcXGQqXFwuP1xcZCsoPzplWystXT9cXGQrKT8pXFxiL2ksXHJcblx0J29wZXJhdG9yJzogLy0tP3xcXCtcXCs/fCE9Pz0/fDw9P3w+PT98PT0/PT98JiY/fFxcfFxcfD98XFw/fFxcKnxcXC98fnxcXF58JS8sXHJcblx0J3B1bmN0dWF0aW9uJzogL1t7fVtcXF07KCksLjpdL1xyXG59O1xyXG5cclxuXHJcbi8qICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICAgICBCZWdpbiBwcmlzbS1qYXZhc2NyaXB0LmpzXHJcbioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiogKi9cclxuXHJcblByaXNtLmxhbmd1YWdlcy5qYXZhc2NyaXB0ID0gUHJpc20ubGFuZ3VhZ2VzLmV4dGVuZCgnY2xpa2UnLCB7XHJcblx0J2tleXdvcmQnOiAvXFxiKGFzfGFzeW5jfGF3YWl0fGJyZWFrfGNhc2V8Y2F0Y2h8Y2xhc3N8Y29uc3R8Y29udGludWV8ZGVidWdnZXJ8ZGVmYXVsdHxkZWxldGV8ZG98ZWxzZXxlbnVtfGV4cG9ydHxleHRlbmRzfGZpbmFsbHl8Zm9yfGZyb218ZnVuY3Rpb258Z2V0fGlmfGltcGxlbWVudHN8aW1wb3J0fGlufGluc3RhbmNlb2Z8aW50ZXJmYWNlfGxldHxuZXd8bnVsbHxvZnxwYWNrYWdlfHByaXZhdGV8cHJvdGVjdGVkfHB1YmxpY3xyZXR1cm58c2V0fHN0YXRpY3xzdXBlcnxzd2l0Y2h8dGhpc3x0aHJvd3x0cnl8dHlwZW9mfHZhcnx2b2lkfHdoaWxlfHdpdGh8eWllbGQpXFxiLyxcclxuXHQnbnVtYmVyJzogL1xcYi0/KDB4W1xcZEEtRmEtZl0rfDBiWzAxXSt8MG9bMC03XSt8XFxkKlxcLj9cXGQrKFtFZV1bKy1dP1xcZCspP3xOYU58SW5maW5pdHkpXFxiLyxcclxuXHQvLyBBbGxvdyBmb3IgYWxsIG5vbi1BU0NJSSBjaGFyYWN0ZXJzIChTZWUgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMjAwODQ0NClcclxuXHQnZnVuY3Rpb24nOiAvW18kYS16QS1aXFx4QTAtXFx1RkZGRl1bXyRhLXpBLVowLTlcXHhBMC1cXHVGRkZGXSooPz1cXCgpL2lcclxufSk7XHJcblxyXG5QcmlzbS5sYW5ndWFnZXMuaW5zZXJ0QmVmb3JlKCdqYXZhc2NyaXB0JywgJ2tleXdvcmQnLCB7XHJcblx0J3JlZ2V4Jzoge1xyXG5cdFx0cGF0dGVybjogLyhefFteL10pXFwvKD8hXFwvKShcXFsuKz9dfFxcXFwufFteL1xcXFxcXHJcXG5dKStcXC9bZ2lteXVdezAsNX0oPz1cXHMqKCR8W1xcclxcbiwuO30pXSkpLyxcclxuXHRcdGxvb2tiZWhpbmQ6IHRydWUsXHJcblx0XHRncmVlZHk6IHRydWVcclxuXHR9XHJcbn0pO1xyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLmluc2VydEJlZm9yZSgnamF2YXNjcmlwdCcsICdjbGFzcy1uYW1lJywge1xyXG5cdCd0ZW1wbGF0ZS1zdHJpbmcnOiB7XHJcblx0XHRwYXR0ZXJuOiAvYCg/OlxcXFxcXFxcfFxcXFw/W15cXFxcXSkqP2AvLFxyXG5cdFx0Z3JlZWR5OiB0cnVlLFxyXG5cdFx0aW5zaWRlOiB7XHJcblx0XHRcdCdpbnRlcnBvbGF0aW9uJzoge1xyXG5cdFx0XHRcdHBhdHRlcm46IC9cXCRcXHtbXn1dK1xcfS8sXHJcblx0XHRcdFx0aW5zaWRlOiB7XHJcblx0XHRcdFx0XHQnaW50ZXJwb2xhdGlvbi1wdW5jdHVhdGlvbic6IHtcclxuXHRcdFx0XHRcdFx0cGF0dGVybjogL15cXCRcXHt8XFx9JC8sXHJcblx0XHRcdFx0XHRcdGFsaWFzOiAncHVuY3R1YXRpb24nXHJcblx0XHRcdFx0XHR9LFxyXG5cdFx0XHRcdFx0cmVzdDogUHJpc20ubGFuZ3VhZ2VzLmphdmFzY3JpcHRcclxuXHRcdFx0XHR9XHJcblx0XHRcdH0sXHJcblx0XHRcdCdzdHJpbmcnOiAvW1xcc1xcU10rL1xyXG5cdFx0fVxyXG5cdH1cclxufSk7XHJcblxyXG5pZiAoUHJpc20ubGFuZ3VhZ2VzLm1hcmt1cCkge1xyXG5cdFByaXNtLmxhbmd1YWdlcy5pbnNlcnRCZWZvcmUoJ21hcmt1cCcsICd0YWcnLCB7XHJcblx0XHQnc2NyaXB0Jzoge1xyXG5cdFx0XHRwYXR0ZXJuOiAvKDxzY3JpcHRbXFx3XFxXXSo/PilbXFx3XFxXXSo/KD89PFxcL3NjcmlwdD4pL2ksXHJcblx0XHRcdGxvb2tiZWhpbmQ6IHRydWUsXHJcblx0XHRcdGluc2lkZTogUHJpc20ubGFuZ3VhZ2VzLmphdmFzY3JpcHQsXHJcblx0XHRcdGFsaWFzOiAnbGFuZ3VhZ2UtamF2YXNjcmlwdCdcclxuXHRcdH1cclxuXHR9KTtcclxufVxyXG5cclxuUHJpc20ubGFuZ3VhZ2VzLmpzID0gUHJpc20ubGFuZ3VhZ2VzLmphdmFzY3JpcHQ7XHJcblxyXG4vKiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAgICAgQmVnaW4gcHJpc20tZmlsZS1oaWdobGlnaHQuanNcclxuKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiAqL1xyXG5cclxuKGZ1bmN0aW9uICgpIHtcclxuXHRpZiAodHlwZW9mIHNlbGYgPT09ICd1bmRlZmluZWQnIHx8ICFzZWxmLlByaXNtIHx8ICFzZWxmLmRvY3VtZW50IHx8ICFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKSB7XHJcblx0XHRyZXR1cm47XHJcblx0fVxyXG5cclxuXHRzZWxmLlByaXNtLmZpbGVIaWdobGlnaHQgPSBmdW5jdGlvbigpIHtcclxuXHJcblx0XHR2YXIgRXh0ZW5zaW9ucyA9IHtcclxuXHRcdFx0J2pzJzogJ2phdmFzY3JpcHQnLFxyXG5cdFx0XHQncHknOiAncHl0aG9uJyxcclxuXHRcdFx0J3JiJzogJ3J1YnknLFxyXG5cdFx0XHQncHMxJzogJ3Bvd2Vyc2hlbGwnLFxyXG5cdFx0XHQncHNtMSc6ICdwb3dlcnNoZWxsJyxcclxuXHRcdFx0J3NoJzogJ2Jhc2gnLFxyXG5cdFx0XHQnYmF0JzogJ2JhdGNoJyxcclxuXHRcdFx0J2gnOiAnYycsXHJcblx0XHRcdCd0ZXgnOiAnbGF0ZXgnXHJcblx0XHR9O1xyXG5cclxuXHRcdGlmKEFycmF5LnByb3RvdHlwZS5mb3JFYWNoKSB7IC8vIENoZWNrIHRvIHByZXZlbnQgZXJyb3IgaW4gSUU4XHJcblx0XHRcdEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ3ByZVtkYXRhLXNyY10nKSkuZm9yRWFjaChmdW5jdGlvbiAocHJlKSB7XHJcblx0XHRcdFx0dmFyIHNyYyA9IHByZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtc3JjJyk7XHJcblxyXG5cdFx0XHRcdHZhciBsYW5ndWFnZSwgcGFyZW50ID0gcHJlO1xyXG5cdFx0XHRcdHZhciBsYW5nID0gL1xcYmxhbmcoPzp1YWdlKT8tKD8hXFwqKShcXHcrKVxcYi9pO1xyXG5cdFx0XHRcdHdoaWxlIChwYXJlbnQgJiYgIWxhbmcudGVzdChwYXJlbnQuY2xhc3NOYW1lKSkge1xyXG5cdFx0XHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudE5vZGU7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRpZiAocGFyZW50KSB7XHJcblx0XHRcdFx0XHRsYW5ndWFnZSA9IChwcmUuY2xhc3NOYW1lLm1hdGNoKGxhbmcpIHx8IFssICcnXSlbMV07XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRpZiAoIWxhbmd1YWdlKSB7XHJcblx0XHRcdFx0XHR2YXIgZXh0ZW5zaW9uID0gKHNyYy5tYXRjaCgvXFwuKFxcdyspJC8pIHx8IFssICcnXSlbMV07XHJcblx0XHRcdFx0XHRsYW5ndWFnZSA9IEV4dGVuc2lvbnNbZXh0ZW5zaW9uXSB8fCBleHRlbnNpb247XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHR2YXIgY29kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NvZGUnKTtcclxuXHRcdFx0XHRjb2RlLmNsYXNzTmFtZSA9ICdsYW5ndWFnZS0nICsgbGFuZ3VhZ2U7XHJcblxyXG5cdFx0XHRcdHByZS50ZXh0Q29udGVudCA9ICcnO1xyXG5cclxuXHRcdFx0XHRjb2RlLnRleHRDb250ZW50ID0gJ0xvYWRpbmfigKYnO1xyXG5cclxuXHRcdFx0XHRwcmUuYXBwZW5kQ2hpbGQoY29kZSk7XHJcblxyXG5cdFx0XHRcdHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuXHJcblx0XHRcdFx0eGhyLm9wZW4oJ0dFVCcsIHNyYywgdHJ1ZSk7XHJcblxyXG5cdFx0XHRcdHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdFx0XHRpZiAoeGhyLnJlYWR5U3RhdGUgPT0gNCkge1xyXG5cclxuXHRcdFx0XHRcdFx0aWYgKHhoci5zdGF0dXMgPCA0MDAgJiYgeGhyLnJlc3BvbnNlVGV4dCkge1xyXG5cdFx0XHRcdFx0XHRcdGNvZGUudGV4dENvbnRlbnQgPSB4aHIucmVzcG9uc2VUZXh0O1xyXG5cclxuXHRcdFx0XHRcdFx0XHRQcmlzbS5oaWdobGlnaHRFbGVtZW50KGNvZGUpO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdGVsc2UgaWYgKHhoci5zdGF0dXMgPj0gNDAwKSB7XHJcblx0XHRcdFx0XHRcdFx0Y29kZS50ZXh0Q29udGVudCA9ICfinJYgRXJyb3IgJyArIHhoci5zdGF0dXMgKyAnIHdoaWxlIGZldGNoaW5nIGZpbGU6ICcgKyB4aHIuc3RhdHVzVGV4dDtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdFx0XHRjb2RlLnRleHRDb250ZW50ID0gJ+KcliBFcnJvcjogRmlsZSBkb2VzIG5vdCBleGlzdCBvciBpcyBlbXB0eSc7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9O1xyXG5cclxuXHRcdFx0XHR4aHIuc2VuZChudWxsKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblxyXG5cdH07XHJcblxyXG5cdGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBzZWxmLlByaXNtLmZpbGVIaWdobGlnaHQpO1xyXG5cclxufSkoKTtcclxuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBiYWNrZHJvcHM7XHJcblxyXG4gICAgZnVuY3Rpb24gY3JlYXRlQmFja2Ryb3BGb3JTbGlkZShzbGlkZSkge1xyXG4gICAgICB2YXIgYmFja2Ryb3BBdHRyaWJ1dGUgPSBzbGlkZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtYmVzcG9rZS1iYWNrZHJvcCcpO1xyXG5cclxuICAgICAgaWYgKGJhY2tkcm9wQXR0cmlidXRlKSB7XHJcbiAgICAgICAgdmFyIGJhY2tkcm9wID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgYmFja2Ryb3AuY2xhc3NOYW1lID0gYmFja2Ryb3BBdHRyaWJ1dGU7XHJcbiAgICAgICAgYmFja2Ryb3AuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1iYWNrZHJvcCcpO1xyXG4gICAgICAgIGRlY2sucGFyZW50LmFwcGVuZENoaWxkKGJhY2tkcm9wKTtcclxuICAgICAgICByZXR1cm4gYmFja2Ryb3A7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiB1cGRhdGVDbGFzc2VzKGVsKSB7XHJcbiAgICAgIGlmIChlbCkge1xyXG4gICAgICAgIHZhciBpbmRleCA9IGJhY2tkcm9wcy5pbmRleE9mKGVsKSxcclxuICAgICAgICAgIGN1cnJlbnRJbmRleCA9IGRlY2suc2xpZGUoKTtcclxuXHJcbiAgICAgICAgcmVtb3ZlQ2xhc3MoZWwsICdhY3RpdmUnKTtcclxuICAgICAgICByZW1vdmVDbGFzcyhlbCwgJ2luYWN0aXZlJyk7XHJcbiAgICAgICAgcmVtb3ZlQ2xhc3MoZWwsICdiZWZvcmUnKTtcclxuICAgICAgICByZW1vdmVDbGFzcyhlbCwgJ2FmdGVyJyk7XHJcblxyXG4gICAgICAgIGlmIChpbmRleCAhPT0gY3VycmVudEluZGV4KSB7XHJcbiAgICAgICAgICBhZGRDbGFzcyhlbCwgJ2luYWN0aXZlJyk7XHJcbiAgICAgICAgICBhZGRDbGFzcyhlbCwgaW5kZXggPCBjdXJyZW50SW5kZXggPyAnYmVmb3JlJyA6ICdhZnRlcicpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBhZGRDbGFzcyhlbCwgJ2FjdGl2ZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIHJlbW92ZUNsYXNzKGVsLCBjbGFzc05hbWUpIHtcclxuICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnYmVzcG9rZS1iYWNrZHJvcC0nICsgY2xhc3NOYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBhZGRDbGFzcyhlbCwgY2xhc3NOYW1lKSB7XHJcbiAgICAgIGVsLmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYmFja2Ryb3AtJyArIGNsYXNzTmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgYmFja2Ryb3BzID0gZGVjay5zbGlkZXNcclxuICAgICAgLm1hcChjcmVhdGVCYWNrZHJvcEZvclNsaWRlKTtcclxuXHJcbiAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKCkge1xyXG4gICAgICBiYWNrZHJvcHMuZm9yRWFjaCh1cGRhdGVDbGFzc2VzKTtcclxuICAgIH0pO1xyXG4gIH07XHJcbn07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgYWN0aXZlU2xpZGVJbmRleCxcclxuICAgICAgYWN0aXZlQnVsbGV0SW5kZXgsXHJcblxyXG4gICAgICBidWxsZXRzID0gZGVjay5zbGlkZXMubWFwKGZ1bmN0aW9uKHNsaWRlKSB7XHJcbiAgICAgICAgcmV0dXJuIFtdLnNsaWNlLmNhbGwoc2xpZGUucXVlcnlTZWxlY3RvckFsbCgodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnID8gb3B0aW9ucyA6ICdbZGF0YS1iZXNwb2tlLWJ1bGxldF0nKSksIDApO1xyXG4gICAgICB9KSxcclxuXHJcbiAgICAgIG5leHQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgbmV4dFNsaWRlSW5kZXggPSBhY3RpdmVTbGlkZUluZGV4ICsgMTtcclxuXHJcbiAgICAgICAgaWYgKGFjdGl2ZVNsaWRlSGFzQnVsbGV0QnlPZmZzZXQoMSkpIHtcclxuICAgICAgICAgIGFjdGl2YXRlQnVsbGV0KGFjdGl2ZVNsaWRlSW5kZXgsIGFjdGl2ZUJ1bGxldEluZGV4ICsgMSk7XHJcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfSBlbHNlIGlmIChidWxsZXRzW25leHRTbGlkZUluZGV4XSkge1xyXG4gICAgICAgICAgYWN0aXZhdGVCdWxsZXQobmV4dFNsaWRlSW5kZXgsIDApO1xyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuXHJcbiAgICAgIHByZXYgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgcHJldlNsaWRlSW5kZXggPSBhY3RpdmVTbGlkZUluZGV4IC0gMTtcclxuXHJcbiAgICAgICAgaWYgKGFjdGl2ZVNsaWRlSGFzQnVsbGV0QnlPZmZzZXQoLTEpKSB7XHJcbiAgICAgICAgICBhY3RpdmF0ZUJ1bGxldChhY3RpdmVTbGlkZUluZGV4LCBhY3RpdmVCdWxsZXRJbmRleCAtIDEpO1xyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoYnVsbGV0c1twcmV2U2xpZGVJbmRleF0pIHtcclxuICAgICAgICAgIGFjdGl2YXRlQnVsbGV0KHByZXZTbGlkZUluZGV4LCBidWxsZXRzW3ByZXZTbGlkZUluZGV4XS5sZW5ndGggLSAxKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcblxyXG4gICAgICBhY3RpdmF0ZUJ1bGxldCA9IGZ1bmN0aW9uKHNsaWRlSW5kZXgsIGJ1bGxldEluZGV4KSB7XHJcbiAgICAgICAgYWN0aXZlU2xpZGVJbmRleCA9IHNsaWRlSW5kZXg7XHJcbiAgICAgICAgYWN0aXZlQnVsbGV0SW5kZXggPSBidWxsZXRJbmRleDtcclxuXHJcbiAgICAgICAgYnVsbGV0cy5mb3JFYWNoKGZ1bmN0aW9uKHNsaWRlLCBzKSB7XHJcbiAgICAgICAgICBzbGlkZS5mb3JFYWNoKGZ1bmN0aW9uKGJ1bGxldCwgYikge1xyXG4gICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1idWxsZXQnKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChzIDwgc2xpZGVJbmRleCB8fCBzID09PSBzbGlkZUluZGV4ICYmIGIgPD0gYnVsbGV0SW5kZXgpIHtcclxuICAgICAgICAgICAgICBidWxsZXQuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS1idWxsZXQtYWN0aXZlJyk7XHJcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYnVsbGV0LWluYWN0aXZlJyk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5hZGQoJ2Jlc3Bva2UtYnVsbGV0LWluYWN0aXZlJyk7XHJcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYnVsbGV0LWFjdGl2ZScpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAocyA9PT0gc2xpZGVJbmRleCAmJiBiID09PSBidWxsZXRJbmRleCkge1xyXG4gICAgICAgICAgICAgIGJ1bGxldC5jbGFzc0xpc3QuYWRkKCdiZXNwb2tlLWJ1bGxldC1jdXJyZW50Jyk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgYnVsbGV0LmNsYXNzTGlzdC5yZW1vdmUoJ2Jlc3Bva2UtYnVsbGV0LWN1cnJlbnQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0sXHJcblxyXG4gICAgICBhY3RpdmVTbGlkZUhhc0J1bGxldEJ5T2Zmc2V0ID0gZnVuY3Rpb24ob2Zmc2V0KSB7XHJcbiAgICAgICAgcmV0dXJuIGJ1bGxldHNbYWN0aXZlU2xpZGVJbmRleF1bYWN0aXZlQnVsbGV0SW5kZXggKyBvZmZzZXRdICE9PSB1bmRlZmluZWQ7XHJcbiAgICAgIH07XHJcblxyXG4gICAgZGVjay5vbignbmV4dCcsIG5leHQpO1xyXG4gICAgZGVjay5vbigncHJldicsIHByZXYpO1xyXG5cclxuICAgIGRlY2sub24oJ3NsaWRlJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBhY3RpdmF0ZUJ1bGxldChlLmluZGV4LCAwKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGFjdGl2YXRlQnVsbGV0KDAsIDApO1xyXG4gIH07XHJcbn07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIGRlY2suc2xpZGVzLmZvckVhY2goZnVuY3Rpb24oc2xpZGUpIHtcclxuICAgICAgc2xpZGUuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICBpZiAoL0lOUFVUfFRFWFRBUkVBfFNFTEVDVC8udGVzdChlLnRhcmdldC5ub2RlTmFtZSkgfHwgZS50YXJnZXQuY29udGVudEVkaXRhYmxlID09PSAndHJ1ZScpIHtcclxuICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG4gIH07XHJcbn07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBwYXJzZUhhc2ggPSBmdW5jdGlvbigpIHtcclxuICAgICAgdmFyIGhhc2ggPSB3aW5kb3cubG9jYXRpb24uaGFzaC5zbGljZSgxKSxcclxuICAgICAgICBzbGlkZU51bWJlck9yTmFtZSA9IHBhcnNlSW50KGhhc2gsIDEwKTtcclxuXHJcbiAgICAgIGlmIChoYXNoKSB7XHJcbiAgICAgICAgaWYgKHNsaWRlTnVtYmVyT3JOYW1lKSB7XHJcbiAgICAgICAgICBhY3RpdmF0ZVNsaWRlKHNsaWRlTnVtYmVyT3JOYW1lIC0gMSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGRlY2suc2xpZGVzLmZvckVhY2goZnVuY3Rpb24oc2xpZGUsIGkpIHtcclxuICAgICAgICAgICAgaWYgKHNsaWRlLmdldEF0dHJpYnV0ZSgnZGF0YS1iZXNwb2tlLWhhc2gnKSA9PT0gaGFzaCkge1xyXG4gICAgICAgICAgICAgIGFjdGl2YXRlU2xpZGUoaSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICB2YXIgYWN0aXZhdGVTbGlkZSA9IGZ1bmN0aW9uKGluZGV4KSB7XHJcbiAgICAgIHZhciBpbmRleFRvQWN0aXZhdGUgPSAtMSA8IGluZGV4ICYmIGluZGV4IDwgZGVjay5zbGlkZXMubGVuZ3RoID8gaW5kZXggOiAwO1xyXG4gICAgICBpZiAoaW5kZXhUb0FjdGl2YXRlICE9PSBkZWNrLnNsaWRlKCkpIHtcclxuICAgICAgICBkZWNrLnNsaWRlKGluZGV4VG9BY3RpdmF0ZSk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgcGFyc2VIYXNoKCk7XHJcblxyXG4gICAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICB2YXIgc2xpZGVOYW1lID0gZS5zbGlkZS5nZXRBdHRyaWJ1dGUoJ2RhdGEtYmVzcG9rZS1oYXNoJyk7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBzbGlkZU5hbWUgfHwgZS5pbmRleCArIDE7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2hhc2hjaGFuZ2UnLCBwYXJzZUhhc2gpO1xyXG4gICAgfSwgMCk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBpc0hvcml6b250YWwgPSBvcHRpb25zICE9PSAndmVydGljYWwnO1xyXG5cclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgIGlmIChlLndoaWNoID09IDM0IHx8IC8vIFBBR0UgRE9XTlxyXG4gICAgICAgIChlLndoaWNoID09IDMyICYmICFlLnNoaWZ0S2V5KSB8fCAvLyBTUEFDRSBXSVRIT1VUIFNISUZUXHJcbiAgICAgICAgKGlzSG9yaXpvbnRhbCAmJiBlLndoaWNoID09IDM5KSB8fCAvLyBSSUdIVFxyXG4gICAgICAgICghaXNIb3Jpem9udGFsICYmIGUud2hpY2ggPT0gNDApIC8vIERPV05cclxuICAgICAgKSB7IGRlY2submV4dCgpOyB9XHJcblxyXG4gICAgICBpZiAoZS53aGljaCA9PSAzMyB8fCAvLyBQQUdFIFVQXHJcbiAgICAgICAgKGUud2hpY2ggPT0gMzIgJiYgZS5zaGlmdEtleSkgfHwgLy8gU1BBQ0UgKyBTSElGVFxyXG4gICAgICAgIChpc0hvcml6b250YWwgJiYgZS53aGljaCA9PSAzNykgfHwgLy8gTEVGVFxyXG4gICAgICAgICghaXNIb3Jpem9udGFsICYmIGUud2hpY2ggPT0gMzgpIC8vIFVQXHJcbiAgICAgICkgeyBkZWNrLnByZXYoKTsgfVxyXG4gICAgfSk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uIChkZWNrKSB7XHJcbiAgICB2YXIgcHJvZ3Jlc3NQYXJlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcclxuICAgICAgcHJvZ3Jlc3NCYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcclxuICAgICAgcHJvcCA9IG9wdGlvbnMgPT09ICd2ZXJ0aWNhbCcgPyAnaGVpZ2h0JyA6ICd3aWR0aCc7XHJcblxyXG4gICAgcHJvZ3Jlc3NQYXJlbnQuY2xhc3NOYW1lID0gJ2Jlc3Bva2UtcHJvZ3Jlc3MtcGFyZW50JztcclxuICAgIHByb2dyZXNzQmFyLmNsYXNzTmFtZSA9ICdiZXNwb2tlLXByb2dyZXNzLWJhcic7XHJcbiAgICBwcm9ncmVzc1BhcmVudC5hcHBlbmRDaGlsZChwcm9ncmVzc0Jhcik7XHJcbiAgICBkZWNrLnBhcmVudC5hcHBlbmRDaGlsZChwcm9ncmVzc1BhcmVudCk7XHJcblxyXG4gICAgZGVjay5vbignYWN0aXZhdGUnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgIHByb2dyZXNzQmFyLnN0eWxlW3Byb3BdID0gKGUuaW5kZXggKiAxMDAgLyAoZGVjay5zbGlkZXMubGVuZ3RoIC0gMSkpICsgJyUnO1xyXG4gICAgfSk7XHJcbiAgfTtcclxufTtcclxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uKGRlY2spIHtcclxuICAgIHZhciBwYXJlbnQgPSBkZWNrLnBhcmVudCxcclxuICAgICAgZmlyc3RTbGlkZSA9IGRlY2suc2xpZGVzWzBdLFxyXG4gICAgICBzbGlkZUhlaWdodCA9IGZpcnN0U2xpZGUub2Zmc2V0SGVpZ2h0LFxyXG4gICAgICBzbGlkZVdpZHRoID0gZmlyc3RTbGlkZS5vZmZzZXRXaWR0aCxcclxuICAgICAgdXNlWm9vbSA9IG9wdGlvbnMgPT09ICd6b29tJyB8fCAoJ3pvb20nIGluIHBhcmVudC5zdHlsZSAmJiBvcHRpb25zICE9PSAndHJhbnNmb3JtJyksXHJcblxyXG4gICAgICB3cmFwID0gZnVuY3Rpb24oZWxlbWVudCkge1xyXG4gICAgICAgIHZhciB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgd3JhcHBlci5jbGFzc05hbWUgPSAnYmVzcG9rZS1zY2FsZS1wYXJlbnQnO1xyXG4gICAgICAgIGVsZW1lbnQucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUod3JhcHBlciwgZWxlbWVudCk7XHJcbiAgICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChlbGVtZW50KTtcclxuICAgICAgICByZXR1cm4gd3JhcHBlcjtcclxuICAgICAgfSxcclxuXHJcbiAgICAgIGVsZW1lbnRzID0gdXNlWm9vbSA/IGRlY2suc2xpZGVzIDogZGVjay5zbGlkZXMubWFwKHdyYXApLFxyXG5cclxuICAgICAgdHJhbnNmb3JtUHJvcGVydHkgPSAoZnVuY3Rpb24ocHJvcGVydHkpIHtcclxuICAgICAgICB2YXIgcHJlZml4ZXMgPSAnTW96IFdlYmtpdCBPIG1zJy5zcGxpdCgnICcpO1xyXG4gICAgICAgIHJldHVybiBwcmVmaXhlcy5yZWR1Y2UoZnVuY3Rpb24oY3VycmVudFByb3BlcnR5LCBwcmVmaXgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHByZWZpeCArIHByb3BlcnR5IGluIHBhcmVudC5zdHlsZSA/IHByZWZpeCArIHByb3BlcnR5IDogY3VycmVudFByb3BlcnR5O1xyXG4gICAgICAgICAgfSwgcHJvcGVydHkudG9Mb3dlckNhc2UoKSk7XHJcbiAgICAgIH0oJ1RyYW5zZm9ybScpKSxcclxuXHJcbiAgICAgIHNjYWxlID0gdXNlWm9vbSA/XHJcbiAgICAgICAgZnVuY3Rpb24ocmF0aW8sIGVsZW1lbnQpIHtcclxuICAgICAgICAgIGVsZW1lbnQuc3R5bGUuem9vbSA9IHJhdGlvO1xyXG4gICAgICAgIH0gOlxyXG4gICAgICAgIGZ1bmN0aW9uKHJhdGlvLCBlbGVtZW50KSB7XHJcbiAgICAgICAgICBlbGVtZW50LnN0eWxlW3RyYW5zZm9ybVByb3BlcnR5XSA9ICdzY2FsZSgnICsgcmF0aW8gKyAnKSc7XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgIHNjYWxlQWxsID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIHhTY2FsZSA9IHBhcmVudC5vZmZzZXRXaWR0aCAvIHNsaWRlV2lkdGgsXHJcbiAgICAgICAgICB5U2NhbGUgPSBwYXJlbnQub2Zmc2V0SGVpZ2h0IC8gc2xpZGVIZWlnaHQ7XHJcblxyXG4gICAgICAgIGVsZW1lbnRzLmZvckVhY2goc2NhbGUuYmluZChudWxsLCBNYXRoLm1pbih4U2NhbGUsIHlTY2FsZSkpKTtcclxuICAgICAgfTtcclxuXHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgc2NhbGVBbGwpO1xyXG4gICAgc2NhbGVBbGwoKTtcclxuICB9O1xyXG5cclxufTtcclxuIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLyohXHJcbiAqIGJlc3Bva2UtdGhlbWUtY3ViZSB2Mi4wLjFcclxuICpcclxuICogQ29weXJpZ2h0IDIwMTQsIE1hcmsgRGFsZ2xlaXNoXHJcbiAqIFRoaXMgY29udGVudCBpcyByZWxlYXNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2VcclxuICogaHR0cDovL21pdC1saWNlbnNlLm9yZy9tYXJrZGFsZ2xlaXNoXHJcbiAqL1xyXG5cclxuIWZ1bmN0aW9uKGUpe2lmKFwib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzKW1vZHVsZS5leHBvcnRzPWUoKTtlbHNlIGlmKFwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZClkZWZpbmUoZSk7ZWxzZXt2YXIgbztcInVuZGVmaW5lZFwiIT10eXBlb2Ygd2luZG93P289d2luZG93OlwidW5kZWZpbmVkXCIhPXR5cGVvZiBnbG9iYWw/bz1nbG9iYWw6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHNlbGYmJihvPXNlbGYpO3ZhciBmPW87Zj1mLmJlc3Bva2V8fChmLmJlc3Bva2U9e30pLGY9Zi50aGVtZXN8fChmLnRoZW1lcz17fSksZi5jdWJlPWUoKX19KGZ1bmN0aW9uKCl7dmFyIGRlZmluZSxtb2R1bGUsZXhwb3J0cztyZXR1cm4gKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoezE6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xyXG5cclxudmFyIGNsYXNzZXMgPSBfZGVyZXFfKCdiZXNwb2tlLWNsYXNzZXMnKTtcclxudmFyIGluc2VydENzcyA9IF9kZXJlcV8oJ2luc2VydC1jc3MnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XHJcbiAgdmFyIGNzcyA9IFwiKnstbW96LWJveC1zaXppbmc6Ym9yZGVyLWJveDtib3gtc2l6aW5nOmJvcmRlci1ib3g7bWFyZ2luOjA7cGFkZGluZzowfUBtZWRpYSBwcmludHsqey13ZWJraXQtcHJpbnQtY29sb3ItYWRqdXN0OmV4YWN0fX1AcGFnZXtzaXplOmxhbmRzY2FwZTttYXJnaW46MH0uYmVzcG9rZS1wYXJlbnR7LXdlYmtpdC10cmFuc2l0aW9uOmJhY2tncm91bmQgLjZzIGVhc2U7dHJhbnNpdGlvbjpiYWNrZ3JvdW5kIC42cyBlYXNlO3Bvc2l0aW9uOmFic29sdXRlO3RvcDowO2JvdHRvbTowO2xlZnQ6MDtyaWdodDowO292ZXJmbG93OmhpZGRlbn1AbWVkaWEgcHJpbnR7LmJlc3Bva2UtcGFyZW50e292ZXJmbG93OnZpc2libGU7cG9zaXRpb246c3RhdGljfX0uYmVzcG9rZS10aGVtZS1jdWJlLXNsaWRlLXBhcmVudHtwb3NpdGlvbjphYnNvbHV0ZTt0b3A6MDtsZWZ0OjA7cmlnaHQ6MDtib3R0b206MDstd2Via2l0LXBlcnNwZWN0aXZlOjYwMHB4O3BlcnNwZWN0aXZlOjYwMHB4O3BvaW50ZXItZXZlbnRzOm5vbmV9LmJlc3Bva2Utc2xpZGV7cG9pbnRlci1ldmVudHM6YXV0bzstd2Via2l0LXRyYW5zaXRpb246LXdlYmtpdC10cmFuc2Zvcm0gLjZzIGVhc2Usb3BhY2l0eSAuNnMgZWFzZSxiYWNrZ3JvdW5kIC42cyBlYXNlO3RyYW5zaXRpb246dHJhbnNmb3JtIC42cyBlYXNlLG9wYWNpdHkgLjZzIGVhc2UsYmFja2dyb3VuZCAuNnMgZWFzZTstd2Via2l0LXRyYW5zZm9ybS1vcmlnaW46NTAlIDUwJSAwO3RyYW5zZm9ybS1vcmlnaW46NTAlIDUwJSAwOy13ZWJraXQtYmFja2ZhY2UtdmlzaWJpbGl0eTpoaWRkZW47YmFja2ZhY2UtdmlzaWJpbGl0eTpoaWRkZW47ZGlzcGxheTotd2Via2l0LWJveDtkaXNwbGF5Oi13ZWJraXQtZmxleDtkaXNwbGF5Oi1tcy1mbGV4Ym94O2Rpc3BsYXk6ZmxleDstd2Via2l0LWJveC1vcmllbnQ6dmVydGljYWw7LXdlYmtpdC1ib3gtZGlyZWN0aW9uOm5vcm1hbDstd2Via2l0LWZsZXgtZGlyZWN0aW9uOmNvbHVtbjstbXMtZmxleC1kaXJlY3Rpb246Y29sdW1uO2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjstd2Via2l0LWJveC1wYWNrOmNlbnRlcjstd2Via2l0LWp1c3RpZnktY29udGVudDpjZW50ZXI7LW1zLWZsZXgtcGFjazpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcjstd2Via2l0LWJveC1hbGlnbjpjZW50ZXI7LXdlYmtpdC1hbGlnbi1pdGVtczpjZW50ZXI7LW1zLWZsZXgtYWxpZ246Y2VudGVyO2FsaWduLWl0ZW1zOmNlbnRlcjt0ZXh0LWFsaWduOmNlbnRlcjt3aWR0aDo2NDBweDtoZWlnaHQ6NDgwcHg7cG9zaXRpb246YWJzb2x1dGU7dG9wOjUwJTttYXJnaW4tdG9wOi0yNDBweDtsZWZ0OjUwJTttYXJnaW4tbGVmdDotMzIwcHg7YmFja2dyb3VuZDojZWFlYWVhO3BhZGRpbmc6NDBweDtib3JkZXItcmFkaXVzOjB9QG1lZGlhIHByaW50ey5iZXNwb2tlLXNsaWRle3pvb206MSFpbXBvcnRhbnQ7aGVpZ2h0Ojc0M3B4O3dpZHRoOjEwMCU7cGFnZS1icmVhay1iZWZvcmU6YWx3YXlzO3Bvc2l0aW9uOnN0YXRpYzttYXJnaW46MDstd2Via2l0LXRyYW5zaXRpb246bm9uZTt0cmFuc2l0aW9uOm5vbmV9fS5iZXNwb2tlLWJlZm9yZXstd2Via2l0LXRyYW5zZm9ybTp0cmFuc2xhdGVYKDEwMHB4KXRyYW5zbGF0ZVgoLTMyMHB4KXJvdGF0ZVkoLTkwZGVnKXRyYW5zbGF0ZVgoLTMyMHB4KTt0cmFuc2Zvcm06dHJhbnNsYXRlWCgxMDBweCl0cmFuc2xhdGVYKC0zMjBweClyb3RhdGVZKC05MGRlZyl0cmFuc2xhdGVYKC0zMjBweCl9QG1lZGlhIHByaW50ey5iZXNwb2tlLWJlZm9yZXstd2Via2l0LXRyYW5zZm9ybTpub25lO3RyYW5zZm9ybTpub25lfX0uYmVzcG9rZS1hZnRlcnstd2Via2l0LXRyYW5zZm9ybTp0cmFuc2xhdGVYKC0xMDBweCl0cmFuc2xhdGVYKDMyMHB4KXJvdGF0ZVkoOTBkZWcpdHJhbnNsYXRlWCgzMjBweCk7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoLTEwMHB4KXRyYW5zbGF0ZVgoMzIwcHgpcm90YXRlWSg5MGRlZyl0cmFuc2xhdGVYKDMyMHB4KX1AbWVkaWEgcHJpbnR7LmJlc3Bva2UtYWZ0ZXJ7LXdlYmtpdC10cmFuc2Zvcm06bm9uZTt0cmFuc2Zvcm06bm9uZX19LmJlc3Bva2UtaW5hY3RpdmV7b3BhY2l0eTowO3BvaW50ZXItZXZlbnRzOm5vbmV9QG1lZGlhIHByaW50ey5iZXNwb2tlLWluYWN0aXZle29wYWNpdHk6MX19LmJlc3Bva2UtYWN0aXZle29wYWNpdHk6MX0uYmVzcG9rZS1idWxsZXR7LXdlYmtpdC10cmFuc2l0aW9uOmFsbCAuM3MgZWFzZTt0cmFuc2l0aW9uOmFsbCAuM3MgZWFzZX1AbWVkaWEgcHJpbnR7LmJlc3Bva2UtYnVsbGV0ey13ZWJraXQtdHJhbnNpdGlvbjpub25lO3RyYW5zaXRpb246bm9uZX19LmJlc3Bva2UtYnVsbGV0LWluYWN0aXZle29wYWNpdHk6MH1saS5iZXNwb2tlLWJ1bGxldC1pbmFjdGl2ZXstd2Via2l0LXRyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpO3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfUBtZWRpYSBwcmludHtsaS5iZXNwb2tlLWJ1bGxldC1pbmFjdGl2ZXstd2Via2l0LXRyYW5zZm9ybTpub25lO3RyYW5zZm9ybTpub25lfX1AbWVkaWEgcHJpbnR7LmJlc3Bva2UtYnVsbGV0LWluYWN0aXZle29wYWNpdHk6MX19LmJlc3Bva2UtYnVsbGV0LWFjdGl2ZXtvcGFjaXR5OjF9LmJlc3Bva2Utc2NhbGUtcGFyZW50ey13ZWJraXQtcGVyc3BlY3RpdmU6NjAwcHg7cGVyc3BlY3RpdmU6NjAwcHg7cG9zaXRpb246YWJzb2x1dGU7dG9wOjA7bGVmdDowO3JpZ2h0OjA7Ym90dG9tOjA7cG9pbnRlci1ldmVudHM6bm9uZX0uYmVzcG9rZS1zY2FsZS1wYXJlbnQgLmJlc3Bva2UtYWN0aXZle3BvaW50ZXItZXZlbnRzOmF1dG99QG1lZGlhIHByaW50ey5iZXNwb2tlLXNjYWxlLXBhcmVudHstd2Via2l0LXRyYW5zZm9ybTpub25lIWltcG9ydGFudDt0cmFuc2Zvcm06bm9uZSFpbXBvcnRhbnR9fS5iZXNwb2tlLXByb2dyZXNzLXBhcmVudHtwb3NpdGlvbjphYnNvbHV0ZTt0b3A6MDtsZWZ0OjA7cmlnaHQ6MDtoZWlnaHQ6MnB4fUBtZWRpYSBvbmx5IHNjcmVlbiBhbmQgKG1pbi13aWR0aDoxMzY2cHgpey5iZXNwb2tlLXByb2dyZXNzLXBhcmVudHtoZWlnaHQ6NHB4fX1AbWVkaWEgcHJpbnR7LmJlc3Bva2UtcHJvZ3Jlc3MtcGFyZW50e2Rpc3BsYXk6bm9uZX19LmJlc3Bva2UtcHJvZ3Jlc3MtYmFyey13ZWJraXQtdHJhbnNpdGlvbjp3aWR0aCAuNnMgZWFzZTt0cmFuc2l0aW9uOndpZHRoIC42cyBlYXNlO3Bvc2l0aW9uOmFic29sdXRlO2hlaWdodDoxMDAlO2JhY2tncm91bmQ6IzAwODlmMztib3JkZXItcmFkaXVzOjAgNHB4IDRweCAwfS5lbXBoYXRpY3tiYWNrZ3JvdW5kOiNlYWVhZWF9LmJlc3Bva2UtYmFja2Ryb3B7cG9zaXRpb246YWJzb2x1dGU7dG9wOjA7bGVmdDowO3JpZ2h0OjA7Ym90dG9tOjA7LXdlYmtpdC10cmFuc2Zvcm06dHJhbnNsYXRlWigwKTt0cmFuc2Zvcm06dHJhbnNsYXRlWigwKTstd2Via2l0LXRyYW5zaXRpb246b3BhY2l0eSAuNnMgZWFzZTt0cmFuc2l0aW9uOm9wYWNpdHkgLjZzIGVhc2U7b3BhY2l0eTowO3otaW5kZXg6LTF9LmJlc3Bva2UtYmFja2Ryb3AtYWN0aXZle29wYWNpdHk6MX1wcmV7cGFkZGluZzoyNnB4IWltcG9ydGFudDtib3JkZXItcmFkaXVzOjhweH1ib2R5e2ZvbnQtZmFtaWx5OmhlbHZldGljYSxhcmlhbCxzYW5zLXNlcmlmO2ZvbnQtc2l6ZToxOHB4O2NvbG9yOiM0MDQwNDB9aDF7Zm9udC1zaXplOjcycHg7bGluZS1oZWlnaHQ6ODJweDtsZXR0ZXItc3BhY2luZzotMnB4O21hcmdpbi1ib3R0b206MTZweH1oMntmb250LXNpemU6NDJweDtsZXR0ZXItc3BhY2luZzotMXB4O21hcmdpbi1ib3R0b206OHB4fWgze2ZvbnQtc2l6ZToyNHB4O2ZvbnQtd2VpZ2h0OjQwMDttYXJnaW4tYm90dG9tOjI0cHg7Y29sb3I6IzYwNjA2MH1ocnt2aXNpYmlsaXR5OmhpZGRlbjtoZWlnaHQ6MjBweH11bHtsaXN0LXN0eWxlOm5vbmV9bGl7bWFyZ2luLWJvdHRvbToxMnB4fXB7bWFyZ2luOjAgMTAwcHggMTJweDtsaW5lLWhlaWdodDoyMnB4fWF7Y29sb3I6IzAwODlmMzt0ZXh0LWRlY29yYXRpb246bm9uZX1cIjtcclxuICBpbnNlcnRDc3MoY3NzLCB7IHByZXBlbmQ6IHRydWUgfSk7XHJcblxyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICBjbGFzc2VzKCkoZGVjayk7XHJcblxyXG4gICAgdmFyIHdyYXAgPSBmdW5jdGlvbihlbGVtZW50KSB7XHJcbiAgICAgIHZhciB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgIHdyYXBwZXIuY2xhc3NOYW1lID0gJ2Jlc3Bva2UtdGhlbWUtY3ViZS1zbGlkZS1wYXJlbnQnO1xyXG4gICAgICBlbGVtZW50LnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIGVsZW1lbnQpO1xyXG4gICAgICB3cmFwcGVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xyXG4gICAgfTtcclxuXHJcbiAgICBkZWNrLnNsaWRlcy5mb3JFYWNoKHdyYXApO1xyXG4gIH07XHJcbn07XHJcblxyXG59LHtcImJlc3Bva2UtY2xhc3Nlc1wiOjIsXCJpbnNlcnQtY3NzXCI6M31dLDI6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xyXG4gIHJldHVybiBmdW5jdGlvbihkZWNrKSB7XHJcbiAgICB2YXIgYWRkQ2xhc3MgPSBmdW5jdGlvbihlbCwgY2xzKSB7XHJcbiAgICAgICAgZWwuY2xhc3NMaXN0LmFkZCgnYmVzcG9rZS0nICsgY2xzKTtcclxuICAgICAgfSxcclxuXHJcbiAgICAgIHJlbW92ZUNsYXNzID0gZnVuY3Rpb24oZWwsIGNscykge1xyXG4gICAgICAgIGVsLmNsYXNzTmFtZSA9IGVsLmNsYXNzTmFtZVxyXG4gICAgICAgICAgLnJlcGxhY2UobmV3IFJlZ0V4cCgnYmVzcG9rZS0nICsgY2xzICsnKFxcXFxzfCQpJywgJ2cnKSwgJyAnKVxyXG4gICAgICAgICAgLnRyaW0oKTtcclxuICAgICAgfSxcclxuXHJcbiAgICAgIGRlYWN0aXZhdGUgPSBmdW5jdGlvbihlbCwgaW5kZXgpIHtcclxuICAgICAgICB2YXIgYWN0aXZlU2xpZGUgPSBkZWNrLnNsaWRlc1tkZWNrLnNsaWRlKCldLFxyXG4gICAgICAgICAgb2Zmc2V0ID0gaW5kZXggLSBkZWNrLnNsaWRlKCksXHJcbiAgICAgICAgICBvZmZzZXRDbGFzcyA9IG9mZnNldCA+IDAgPyAnYWZ0ZXInIDogJ2JlZm9yZSc7XHJcblxyXG4gICAgICAgIFsnYmVmb3JlKC1cXFxcZCspPycsICdhZnRlcigtXFxcXGQrKT8nLCAnYWN0aXZlJywgJ2luYWN0aXZlJ10ubWFwKHJlbW92ZUNsYXNzLmJpbmQobnVsbCwgZWwpKTtcclxuXHJcbiAgICAgICAgaWYgKGVsICE9PSBhY3RpdmVTbGlkZSkge1xyXG4gICAgICAgICAgWydpbmFjdGl2ZScsIG9mZnNldENsYXNzLCBvZmZzZXRDbGFzcyArICctJyArIE1hdGguYWJzKG9mZnNldCldLm1hcChhZGRDbGFzcy5iaW5kKG51bGwsIGVsKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9O1xyXG5cclxuICAgIGFkZENsYXNzKGRlY2sucGFyZW50LCAncGFyZW50Jyk7XHJcbiAgICBkZWNrLnNsaWRlcy5tYXAoZnVuY3Rpb24oZWwpIHsgYWRkQ2xhc3MoZWwsICdzbGlkZScpOyB9KTtcclxuXHJcbiAgICBkZWNrLm9uKCdhY3RpdmF0ZScsIGZ1bmN0aW9uKGUpIHtcclxuICAgICAgZGVjay5zbGlkZXMubWFwKGRlYWN0aXZhdGUpO1xyXG4gICAgICBhZGRDbGFzcyhlLnNsaWRlLCAnYWN0aXZlJyk7XHJcbiAgICAgIHJlbW92ZUNsYXNzKGUuc2xpZGUsICdpbmFjdGl2ZScpO1xyXG4gICAgfSk7XHJcbiAgfTtcclxufTtcclxuXHJcbn0se31dLDM6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xyXG52YXIgaW5zZXJ0ZWQgPSB7fTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNzcywgb3B0aW9ucykge1xyXG4gICAgaWYgKGluc2VydGVkW2Nzc10pIHJldHVybjtcclxuICAgIGluc2VydGVkW2Nzc10gPSB0cnVlO1xyXG4gICAgXHJcbiAgICB2YXIgZWxlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XHJcbiAgICBlbGVtLnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0L2NzcycpO1xyXG5cclxuICAgIGlmICgndGV4dENvbnRlbnQnIGluIGVsZW0pIHtcclxuICAgICAgZWxlbS50ZXh0Q29udGVudCA9IGNzcztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGVsZW0uc3R5bGVTaGVldC5jc3NUZXh0ID0gY3NzO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbMF07XHJcbiAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnByZXBlbmQpIHtcclxuICAgICAgICBoZWFkLmluc2VydEJlZm9yZShlbGVtLCBoZWFkLmNoaWxkTm9kZXNbMF0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBoZWFkLmFwcGVuZENoaWxkKGVsZW0pO1xyXG4gICAgfVxyXG59O1xyXG5cclxufSx7fV19LHt9LFsxXSlcclxuKDEpXHJcbn0pO1xufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcclxuICByZXR1cm4gZnVuY3Rpb24oZGVjaykge1xyXG4gICAgdmFyIGF4aXMgPSBvcHRpb25zID09ICd2ZXJ0aWNhbCcgPyAnWScgOiAnWCcsXHJcbiAgICAgIHN0YXJ0UG9zaXRpb24sXHJcbiAgICAgIGRlbHRhO1xyXG5cclxuICAgIGRlY2sucGFyZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBmdW5jdGlvbihlKSB7XHJcbiAgICAgIGlmIChlLnRvdWNoZXMubGVuZ3RoID09IDEpIHtcclxuICAgICAgICBzdGFydFBvc2l0aW9uID0gZS50b3VjaGVzWzBdWydwYWdlJyArIGF4aXNdO1xyXG4gICAgICAgIGRlbHRhID0gMDtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgZGVjay5wYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgZnVuY3Rpb24oZSkge1xyXG4gICAgICBpZiAoZS50b3VjaGVzLmxlbmd0aCA9PSAxKSB7XHJcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgIGRlbHRhID0gZS50b3VjaGVzWzBdWydwYWdlJyArIGF4aXNdIC0gc3RhcnRQb3NpdGlvbjtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgZGVjay5wYXJlbnQuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCBmdW5jdGlvbigpIHtcclxuICAgICAgaWYgKE1hdGguYWJzKGRlbHRhKSA+IDUwKSB7XHJcbiAgICAgICAgZGVja1tkZWx0YSA+IDAgPyAncHJldicgOiAnbmV4dCddKCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH07XHJcbn07XHJcbiIsInZhciBmcm9tID0gZnVuY3Rpb24ob3B0cywgcGx1Z2lucykge1xyXG4gIHZhciBwYXJlbnQgPSAob3B0cy5wYXJlbnQgfHwgb3B0cykubm9kZVR5cGUgPT09IDEgPyAob3B0cy5wYXJlbnQgfHwgb3B0cykgOiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKG9wdHMucGFyZW50IHx8IG9wdHMpLFxyXG4gICAgc2xpZGVzID0gW10uZmlsdGVyLmNhbGwodHlwZW9mIG9wdHMuc2xpZGVzID09PSAnc3RyaW5nJyA/IHBhcmVudC5xdWVyeVNlbGVjdG9yQWxsKG9wdHMuc2xpZGVzKSA6IChvcHRzLnNsaWRlcyB8fCBwYXJlbnQuY2hpbGRyZW4pLCBmdW5jdGlvbihlbCkgeyByZXR1cm4gZWwubm9kZU5hbWUgIT09ICdTQ1JJUFQnOyB9KSxcclxuICAgIGFjdGl2ZVNsaWRlID0gc2xpZGVzWzBdLFxyXG4gICAgbGlzdGVuZXJzID0ge30sXHJcblxyXG4gICAgYWN0aXZhdGUgPSBmdW5jdGlvbihpbmRleCwgY3VzdG9tRGF0YSkge1xyXG4gICAgICBpZiAoIXNsaWRlc1tpbmRleF0pIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZpcmUoJ2RlYWN0aXZhdGUnLCBjcmVhdGVFdmVudERhdGEoYWN0aXZlU2xpZGUsIGN1c3RvbURhdGEpKTtcclxuICAgICAgYWN0aXZlU2xpZGUgPSBzbGlkZXNbaW5kZXhdO1xyXG4gICAgICBmaXJlKCdhY3RpdmF0ZScsIGNyZWF0ZUV2ZW50RGF0YShhY3RpdmVTbGlkZSwgY3VzdG9tRGF0YSkpO1xyXG4gICAgfSxcclxuXHJcbiAgICBzbGlkZSA9IGZ1bmN0aW9uKGluZGV4LCBjdXN0b21EYXRhKSB7XHJcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoKSB7XHJcbiAgICAgICAgZmlyZSgnc2xpZGUnLCBjcmVhdGVFdmVudERhdGEoc2xpZGVzW2luZGV4XSwgY3VzdG9tRGF0YSkpICYmIGFjdGl2YXRlKGluZGV4LCBjdXN0b21EYXRhKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gc2xpZGVzLmluZGV4T2YoYWN0aXZlU2xpZGUpO1xyXG4gICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgIHN0ZXAgPSBmdW5jdGlvbihvZmZzZXQsIGN1c3RvbURhdGEpIHtcclxuICAgICAgdmFyIHNsaWRlSW5kZXggPSBzbGlkZXMuaW5kZXhPZihhY3RpdmVTbGlkZSkgKyBvZmZzZXQ7XHJcblxyXG4gICAgICBmaXJlKG9mZnNldCA+IDAgPyAnbmV4dCcgOiAncHJldicsIGNyZWF0ZUV2ZW50RGF0YShhY3RpdmVTbGlkZSwgY3VzdG9tRGF0YSkpICYmIGFjdGl2YXRlKHNsaWRlSW5kZXgsIGN1c3RvbURhdGEpO1xyXG4gICAgfSxcclxuXHJcbiAgICBvbiA9IGZ1bmN0aW9uKGV2ZW50TmFtZSwgY2FsbGJhY2spIHtcclxuICAgICAgKGxpc3RlbmVyc1tldmVudE5hbWVdIHx8IChsaXN0ZW5lcnNbZXZlbnROYW1lXSA9IFtdKSkucHVzaChjYWxsYmFjayk7XHJcbiAgICAgIHJldHVybiBvZmYuYmluZChudWxsLCBldmVudE5hbWUsIGNhbGxiYWNrKTtcclxuICAgIH0sXHJcblxyXG4gICAgb2ZmID0gZnVuY3Rpb24oZXZlbnROYW1lLCBjYWxsYmFjaykge1xyXG4gICAgICBsaXN0ZW5lcnNbZXZlbnROYW1lXSA9IChsaXN0ZW5lcnNbZXZlbnROYW1lXSB8fCBbXSkuZmlsdGVyKGZ1bmN0aW9uKGxpc3RlbmVyKSB7IHJldHVybiBsaXN0ZW5lciAhPT0gY2FsbGJhY2s7IH0pO1xyXG4gICAgfSxcclxuXHJcbiAgICBmaXJlID0gZnVuY3Rpb24oZXZlbnROYW1lLCBldmVudERhdGEpIHtcclxuICAgICAgcmV0dXJuIChsaXN0ZW5lcnNbZXZlbnROYW1lXSB8fCBbXSlcclxuICAgICAgICAucmVkdWNlKGZ1bmN0aW9uKG5vdENhbmNlbGxlZCwgY2FsbGJhY2spIHtcclxuICAgICAgICAgIHJldHVybiBub3RDYW5jZWxsZWQgJiYgY2FsbGJhY2soZXZlbnREYXRhKSAhPT0gZmFsc2U7XHJcbiAgICAgICAgfSwgdHJ1ZSk7XHJcbiAgICB9LFxyXG5cclxuICAgIGNyZWF0ZUV2ZW50RGF0YSA9IGZ1bmN0aW9uKGVsLCBldmVudERhdGEpIHtcclxuICAgICAgZXZlbnREYXRhID0gZXZlbnREYXRhIHx8IHt9O1xyXG4gICAgICBldmVudERhdGEuaW5kZXggPSBzbGlkZXMuaW5kZXhPZihlbCk7XHJcbiAgICAgIGV2ZW50RGF0YS5zbGlkZSA9IGVsO1xyXG4gICAgICByZXR1cm4gZXZlbnREYXRhO1xyXG4gICAgfSxcclxuXHJcbiAgICBkZWNrID0ge1xyXG4gICAgICBvbjogb24sXHJcbiAgICAgIG9mZjogb2ZmLFxyXG4gICAgICBmaXJlOiBmaXJlLFxyXG4gICAgICBzbGlkZTogc2xpZGUsXHJcbiAgICAgIG5leHQ6IHN0ZXAuYmluZChudWxsLCAxKSxcclxuICAgICAgcHJldjogc3RlcC5iaW5kKG51bGwsIC0xKSxcclxuICAgICAgcGFyZW50OiBwYXJlbnQsXHJcbiAgICAgIHNsaWRlczogc2xpZGVzXHJcbiAgICB9O1xyXG5cclxuICAocGx1Z2lucyB8fCBbXSkuZm9yRWFjaChmdW5jdGlvbihwbHVnaW4pIHtcclxuICAgIHBsdWdpbihkZWNrKTtcclxuICB9KTtcclxuXHJcbiAgYWN0aXZhdGUoMCk7XHJcblxyXG4gIHJldHVybiBkZWNrO1xyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSB7XHJcbiAgZnJvbTogZnJvbVxyXG59O1xyXG4iLCIvLyBSZXF1aXJlIE5vZGUgbW9kdWxlcyBpbiB0aGUgYnJvd3NlciB0aGFua3MgdG8gQnJvd3NlcmlmeTogaHR0cDovL2Jyb3dzZXJpZnkub3JnXHJcbnZhciBiZXNwb2tlID0gcmVxdWlyZSgnYmVzcG9rZScpLFxyXG4gIGN1YmUgPSByZXF1aXJlKCdiZXNwb2tlLXRoZW1lLWN1YmUnKSxcclxuICBrZXlzID0gcmVxdWlyZSgnYmVzcG9rZS1rZXlzJyksXHJcbiAgdG91Y2ggPSByZXF1aXJlKCdiZXNwb2tlLXRvdWNoJyksXHJcbiAgYnVsbGV0cyA9IHJlcXVpcmUoJ2Jlc3Bva2UtYnVsbGV0cycpLFxyXG4gIGJhY2tkcm9wID0gcmVxdWlyZSgnYmVzcG9rZS1iYWNrZHJvcCcpLFxyXG4gIHNjYWxlID0gcmVxdWlyZSgnYmVzcG9rZS1zY2FsZScpLFxyXG4gIGhhc2ggPSByZXF1aXJlKCdiZXNwb2tlLWhhc2gnKSxcclxuICBwcm9ncmVzcyA9IHJlcXVpcmUoJ2Jlc3Bva2UtcHJvZ3Jlc3MnKSxcclxuICBmb3JtcyA9IHJlcXVpcmUoJ2Jlc3Bva2UtZm9ybXMnKTtcclxuXHJcbi8vIEJlc3Bva2UuanNcclxuYmVzcG9rZS5mcm9tKCdhcnRpY2xlJywgW1xyXG4gIGN1YmUoKSxcclxuICBrZXlzKCksXHJcbiAgdG91Y2goKSxcclxuICBidWxsZXRzKCdsaSwgLmJ1bGxldCcpLFxyXG4gIGJhY2tkcm9wKCksXHJcbiAgc2NhbGUoKSxcclxuICBoYXNoKCksXHJcbiAgcHJvZ3Jlc3MoKSxcclxuICBmb3JtcygpXHJcbl0pO1xyXG5cclxuLy8gUHJpc20gc3ludGF4IGhpZ2hsaWdodGluZ1xyXG4vLyBUaGlzIGlzIGFjdHVhbGx5IGxvYWRlZCBmcm9tIFwiYm93ZXJfY29tcG9uZW50c1wiIHRoYW5rcyB0b1xyXG4vLyBkZWJvd2VyaWZ5OiBodHRwczovL2dpdGh1Yi5jb20vZXVnZW5ld2FyZS9kZWJvd2VyaWZ5XHJcbnJlcXVpcmUoXCIuLy4uXFxcXC4uXFxcXGJvd2VyX2NvbXBvbmVudHNcXFxccHJpc21cXFxccHJpc20uanNcIik7XHJcblxyXG4iXX0=
