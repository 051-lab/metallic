"use strict";
(() => {
  // node_modules/turndown/lib/turndown.browser.es.js
  function extend(destination) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) destination[key] = source[key];
      }
    }
    return destination;
  }
  function repeat(character, count) {
    return Array(count + 1).join(character);
  }
  function trimLeadingNewlines(string) {
    return string.replace(/^\n*/, "");
  }
  function trimTrailingNewlines(string) {
    var indexEnd = string.length;
    while (indexEnd > 0 && string[indexEnd - 1] === "\n") indexEnd--;
    return string.substring(0, indexEnd);
  }
  function trimNewlines(string) {
    return trimTrailingNewlines(trimLeadingNewlines(string));
  }
  var blockElements = ["ADDRESS", "ARTICLE", "ASIDE", "AUDIO", "BLOCKQUOTE", "BODY", "CANVAS", "CENTER", "DD", "DIR", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "FRAMESET", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP", "HR", "HTML", "ISINDEX", "LI", "MAIN", "MENU", "NAV", "NOFRAMES", "NOSCRIPT", "OL", "OUTPUT", "P", "PRE", "SECTION", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL"];
  function isBlock(node) {
    return is(node, blockElements);
  }
  var voidElements = ["AREA", "BASE", "BR", "COL", "COMMAND", "EMBED", "HR", "IMG", "INPUT", "KEYGEN", "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR"];
  function isVoid(node) {
    return is(node, voidElements);
  }
  function hasVoid(node) {
    return has(node, voidElements);
  }
  var meaningfulWhenBlankElements = ["A", "TABLE", "THEAD", "TBODY", "TFOOT", "TH", "TD", "IFRAME", "SCRIPT", "AUDIO", "VIDEO"];
  function isMeaningfulWhenBlank(node) {
    return is(node, meaningfulWhenBlankElements);
  }
  function hasMeaningfulWhenBlank(node) {
    return has(node, meaningfulWhenBlankElements);
  }
  function is(node, tagNames) {
    return tagNames.indexOf(node.nodeName) >= 0;
  }
  function has(node, tagNames) {
    return node.getElementsByTagName && tagNames.some(function(tagName) {
      return node.getElementsByTagName(tagName).length;
    });
  }
  var markdownEscapes = [[/\\/g, "\\\\"], [/\*/g, "\\*"], [/^-/g, "\\-"], [/^\+ /g, "\\+ "], [/^(=+)/g, "\\$1"], [/^(#{1,6}) /g, "\\$1 "], [/`/g, "\\`"], [/^~~~/g, "\\~~~"], [/\[/g, "\\["], [/\]/g, "\\]"], [/^>/g, "\\>"], [/_/g, "\\_"], [/^(\d+)\. /g, "$1\\. "]];
  function escapeMarkdown(string) {
    return markdownEscapes.reduce(function(accumulator, escape2) {
      return accumulator.replace(escape2[0], escape2[1]);
    }, string);
  }
  var rules = {};
  rules.paragraph = {
    filter: "p",
    replacement: function(content) {
      return "\n\n" + content + "\n\n";
    }
  };
  rules.lineBreak = {
    filter: "br",
    replacement: function(content, node, options) {
      return options.br + "\n";
    }
  };
  rules.heading = {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    replacement: function(content, node, options) {
      var hLevel = Number(node.nodeName.charAt(1));
      if (options.headingStyle === "setext" && hLevel < 3) {
        var underline = repeat(hLevel === 1 ? "=" : "-", content.length);
        return "\n\n" + content + "\n" + underline + "\n\n";
      } else {
        return "\n\n" + repeat("#", hLevel) + " " + content + "\n\n";
      }
    }
  };
  rules.blockquote = {
    filter: "blockquote",
    replacement: function(content) {
      content = trimNewlines(content).replace(/^/gm, "> ");
      return "\n\n" + content + "\n\n";
    }
  };
  rules.list = {
    filter: ["ul", "ol"],
    replacement: function(content, node) {
      var parent = node.parentNode;
      if (parent.nodeName === "LI" && parent.lastElementChild === node) {
        return "\n" + content;
      } else {
        return "\n\n" + content + "\n\n";
      }
    }
  };
  rules.listItem = {
    filter: "li",
    replacement: function(content, node, options) {
      var prefix = options.bulletListMarker + "   ";
      var parent = node.parentNode;
      if (parent.nodeName === "OL") {
        var start = parent.getAttribute("start");
        var index = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + index : index + 1) + ".  ";
      }
      var isParagraph = /\n$/.test(content);
      content = trimNewlines(content) + (isParagraph ? "\n" : "");
      content = content.replace(/\n/gm, "\n" + " ".repeat(prefix.length));
      return prefix + content + (node.nextSibling ? "\n" : "");
    }
  };
  rules.indentedCodeBlock = {
    filter: function(node, options) {
      return options.codeBlockStyle === "indented" && node.nodeName === "PRE" && node.firstChild && node.firstChild.nodeName === "CODE";
    },
    replacement: function(content, node, options) {
      return "\n\n    " + node.firstChild.textContent.replace(/\n/g, "\n    ") + "\n\n";
    }
  };
  rules.fencedCodeBlock = {
    filter: function(node, options) {
      return options.codeBlockStyle === "fenced" && node.nodeName === "PRE" && node.firstChild && node.firstChild.nodeName === "CODE";
    },
    replacement: function(content, node, options) {
      var className = node.firstChild.getAttribute("class") || "";
      var language = (className.match(/language-(\S+)/) || [null, ""])[1];
      var code = node.firstChild.textContent;
      var fenceChar = options.fence.charAt(0);
      var fenceSize = 3;
      var fenceInCodeRegex = new RegExp("^" + fenceChar + "{3,}", "gm");
      var match;
      while (match = fenceInCodeRegex.exec(code)) {
        if (match[0].length >= fenceSize) {
          fenceSize = match[0].length + 1;
        }
      }
      var fence = repeat(fenceChar, fenceSize);
      return "\n\n" + fence + language + "\n" + code.replace(/\n$/, "") + "\n" + fence + "\n\n";
    }
  };
  rules.horizontalRule = {
    filter: "hr",
    replacement: function(content, node, options) {
      return "\n\n" + options.hr + "\n\n";
    }
  };
  rules.inlineLink = {
    filter: function(node, options) {
      return options.linkStyle === "inlined" && node.nodeName === "A" && node.getAttribute("href");
    },
    replacement: function(content, node) {
      var href = escapeLinkDestination(node.getAttribute("href"));
      var title = escapeLinkTitle(cleanAttribute(node.getAttribute("title")));
      var titlePart = title ? ' "' + title + '"' : "";
      return "[" + content + "](" + href + titlePart + ")";
    }
  };
  rules.referenceLink = {
    filter: function(node, options) {
      return options.linkStyle === "referenced" && node.nodeName === "A" && node.getAttribute("href");
    },
    replacement: function(content, node, options) {
      var href = escapeLinkDestination(node.getAttribute("href"));
      var title = cleanAttribute(node.getAttribute("title"));
      if (title) title = ' "' + escapeLinkTitle(title) + '"';
      var replacement;
      var reference;
      switch (options.linkReferenceStyle) {
        case "collapsed":
          replacement = "[" + content + "][]";
          reference = "[" + content + "]: " + href + title;
          break;
        case "shortcut":
          replacement = "[" + content + "]";
          reference = "[" + content + "]: " + href + title;
          break;
        default:
          var id = this.references.length + 1;
          replacement = "[" + content + "][" + id + "]";
          reference = "[" + id + "]: " + href + title;
      }
      this.references.push(reference);
      return replacement;
    },
    references: [],
    append: function(options) {
      var references = "";
      if (this.references.length) {
        references = "\n\n" + this.references.join("\n") + "\n\n";
        this.references = [];
      }
      return references;
    }
  };
  rules.emphasis = {
    filter: ["em", "i"],
    replacement: function(content, node, options) {
      if (!content.trim()) return "";
      return options.emDelimiter + content + options.emDelimiter;
    }
  };
  rules.strong = {
    filter: ["strong", "b"],
    replacement: function(content, node, options) {
      if (!content.trim()) return "";
      return options.strongDelimiter + content + options.strongDelimiter;
    }
  };
  rules.code = {
    filter: function(node) {
      var hasSiblings = node.previousSibling || node.nextSibling;
      var isCodeBlock = node.parentNode.nodeName === "PRE" && !hasSiblings;
      return node.nodeName === "CODE" && !isCodeBlock;
    },
    replacement: function(content) {
      if (!content) return "";
      content = content.replace(/\r?\n|\r/g, " ");
      var extraSpace = /^`|^ .*?[^ ].* $|`$/.test(content) ? " " : "";
      var delimiter = "`";
      var matches = content.match(/`+/gm) || [];
      while (matches.indexOf(delimiter) !== -1) delimiter = delimiter + "`";
      return delimiter + extraSpace + content + extraSpace + delimiter;
    }
  };
  rules.image = {
    filter: "img",
    replacement: function(content, node) {
      var alt = escapeMarkdown(cleanAttribute(node.getAttribute("alt")));
      var src = escapeLinkDestination(node.getAttribute("src") || "");
      var title = cleanAttribute(node.getAttribute("title"));
      var titlePart = title ? ' "' + escapeLinkTitle(title) + '"' : "";
      return src ? "![" + alt + "](" + src + titlePart + ")" : "";
    }
  };
  function cleanAttribute(attribute) {
    return attribute ? attribute.replace(/(\n+\s*)+/g, "\n") : "";
  }
  function escapeLinkDestination(destination) {
    var escaped = destination.replace(/([<>()])/g, "\\$1");
    return escaped.indexOf(" ") >= 0 ? "<" + escaped + ">" : escaped;
  }
  function escapeLinkTitle(title) {
    return title.replace(/"/g, '\\"');
  }
  function Rules(options) {
    this.options = options;
    this._keep = [];
    this._remove = [];
    this.blankRule = {
      replacement: options.blankReplacement
    };
    this.keepReplacement = options.keepReplacement;
    this.defaultRule = {
      replacement: options.defaultReplacement
    };
    this.array = [];
    for (var key in options.rules) this.array.push(options.rules[key]);
  }
  Rules.prototype = {
    add: function(key, rule) {
      this.array.unshift(rule);
    },
    keep: function(filter) {
      this._keep.unshift({
        filter,
        replacement: this.keepReplacement
      });
    },
    remove: function(filter) {
      this._remove.unshift({
        filter,
        replacement: function() {
          return "";
        }
      });
    },
    forNode: function(node) {
      if (node.isBlank) return this.blankRule;
      var rule;
      if (rule = findRule(this.array, node, this.options)) return rule;
      if (rule = findRule(this._keep, node, this.options)) return rule;
      if (rule = findRule(this._remove, node, this.options)) return rule;
      return this.defaultRule;
    },
    forEach: function(fn) {
      for (var i = 0; i < this.array.length; i++) fn(this.array[i], i);
    }
  };
  function findRule(rules2, node, options) {
    for (var i = 0; i < rules2.length; i++) {
      var rule = rules2[i];
      if (filterValue(rule, node, options)) return rule;
    }
    return void 0;
  }
  function filterValue(rule, node, options) {
    var filter = rule.filter;
    if (typeof filter === "string") {
      if (filter === node.nodeName.toLowerCase()) return true;
    } else if (Array.isArray(filter)) {
      if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true;
    } else if (typeof filter === "function") {
      if (filter.call(rule, node, options)) return true;
    } else {
      throw new TypeError("`filter` needs to be a string, array, or function");
    }
  }
  function collapseWhitespace(options) {
    var element = options.element;
    var isBlock2 = options.isBlock;
    var isVoid2 = options.isVoid;
    var isPre = options.isPre || function(node2) {
      return node2.nodeName === "PRE";
    };
    if (!element.firstChild || isPre(element)) return;
    var prevText = null;
    var keepLeadingWs = false;
    var prev = null;
    var node = next(prev, element, isPre);
    while (node !== element) {
      if (node.nodeType === 3 || node.nodeType === 4) {
        var text = node.data.replace(/[ \r\n\t]+/g, " ");
        if ((!prevText || / $/.test(prevText.data)) && !keepLeadingWs && text[0] === " ") {
          text = text.substr(1);
        }
        if (!text) {
          node = remove(node);
          continue;
        }
        node.data = text;
        prevText = node;
      } else if (node.nodeType === 1) {
        if (isBlock2(node) || node.nodeName === "BR") {
          if (prevText) {
            prevText.data = prevText.data.replace(/ $/, "");
          }
          prevText = null;
          keepLeadingWs = false;
        } else if (isVoid2(node) || isPre(node)) {
          prevText = null;
          keepLeadingWs = true;
        } else if (prevText) {
          keepLeadingWs = false;
        }
      } else {
        node = remove(node);
        continue;
      }
      var nextNode = next(prev, node, isPre);
      prev = node;
      node = nextNode;
    }
    if (prevText) {
      prevText.data = prevText.data.replace(/ $/, "");
      if (!prevText.data) {
        remove(prevText);
      }
    }
  }
  function remove(node) {
    var next2 = node.nextSibling || node.parentNode;
    node.parentNode.removeChild(node);
    return next2;
  }
  function next(prev, current, isPre) {
    if (prev && prev.parentNode === current || isPre(current)) {
      return current.nextSibling || current.parentNode;
    }
    return current.firstChild || current.nextSibling || current.parentNode;
  }
  var root = typeof window !== "undefined" ? window : {};
  function canParseHTMLNatively() {
    var Parser = root.DOMParser;
    var canParse = false;
    try {
      if (new Parser().parseFromString("", "text/html")) {
        canParse = true;
      }
    } catch (e) {
    }
    return canParse;
  }
  function createHTMLParser() {
    var Parser = function() {
    };
    {
      if (shouldUseActiveX()) {
        Parser.prototype.parseFromString = function(string) {
          var doc = new window.ActiveXObject("htmlfile");
          doc.designMode = "on";
          doc.open();
          doc.write(string);
          doc.close();
          return doc;
        };
      } else {
        Parser.prototype.parseFromString = function(string) {
          var doc = document.implementation.createHTMLDocument("");
          doc.open();
          doc.write(string);
          doc.close();
          return doc;
        };
      }
    }
    return Parser;
  }
  function shouldUseActiveX() {
    var useActiveX = false;
    try {
      document.implementation.createHTMLDocument("").open();
    } catch (e) {
      if (root.ActiveXObject) useActiveX = true;
    }
    return useActiveX;
  }
  var HTMLParser = canParseHTMLNatively() ? root.DOMParser : createHTMLParser();
  function RootNode(input, options) {
    var root2;
    if (typeof input === "string") {
      var doc = htmlParser().parseFromString(
        // DOM parsers arrange elements in the <head> and <body>.
        // Wrapping in a custom element ensures elements are reliably arranged in
        // a single element.
        '<x-turndown id="turndown-root">' + input + "</x-turndown>",
        "text/html"
      );
      root2 = doc.getElementById("turndown-root");
    } else {
      root2 = input.cloneNode(true);
    }
    collapseWhitespace({
      element: root2,
      isBlock,
      isVoid,
      isPre: options.preformattedCode ? isPreOrCode : null
    });
    return root2;
  }
  var _htmlParser;
  function htmlParser() {
    _htmlParser = _htmlParser || new HTMLParser();
    return _htmlParser;
  }
  function isPreOrCode(node) {
    return node.nodeName === "PRE" || node.nodeName === "CODE";
  }
  function Node(node, options) {
    node.isBlock = isBlock(node);
    node.isCode = node.nodeName === "CODE" || node.parentNode.isCode;
    node.isBlank = isBlank(node);
    node.flankingWhitespace = flankingWhitespace(node, options);
    return node;
  }
  function isBlank(node) {
    return !isVoid(node) && !isMeaningfulWhenBlank(node) && /^\s*$/i.test(node.textContent) && !hasVoid(node) && !hasMeaningfulWhenBlank(node);
  }
  function flankingWhitespace(node, options) {
    if (node.isBlock || options.preformattedCode && node.isCode) {
      return {
        leading: "",
        trailing: ""
      };
    }
    var edges = edgeWhitespace(node.textContent);
    if (edges.leadingAscii && isFlankedByWhitespace("left", node, options)) {
      edges.leading = edges.leadingNonAscii;
    }
    if (edges.trailingAscii && isFlankedByWhitespace("right", node, options)) {
      edges.trailing = edges.trailingNonAscii;
    }
    return {
      leading: edges.leading,
      trailing: edges.trailing
    };
  }
  function edgeWhitespace(string) {
    var m = string.match(/^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/);
    return {
      leading: m[1],
      // whole string for whitespace-only strings
      leadingAscii: m[2],
      leadingNonAscii: m[3],
      trailing: m[4],
      // empty for whitespace-only strings
      trailingNonAscii: m[5],
      trailingAscii: m[6]
    };
  }
  function isFlankedByWhitespace(side, node, options) {
    var sibling;
    var regExp;
    var isFlanked;
    if (side === "left") {
      sibling = node.previousSibling;
      regExp = / $/;
    } else {
      sibling = node.nextSibling;
      regExp = /^ /;
    }
    if (sibling) {
      if (sibling.nodeType === 3) {
        isFlanked = regExp.test(sibling.nodeValue);
      } else if (options.preformattedCode && sibling.nodeName === "CODE") {
        isFlanked = false;
      } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
        isFlanked = regExp.test(sibling.textContent);
      }
    }
    return isFlanked;
  }
  var reduce = Array.prototype.reduce;
  function TurndownService(options) {
    if (!(this instanceof TurndownService)) return new TurndownService(options);
    var defaults = {
      rules,
      headingStyle: "setext",
      hr: "* * *",
      bulletListMarker: "*",
      codeBlockStyle: "indented",
      fence: "```",
      emDelimiter: "_",
      strongDelimiter: "**",
      linkStyle: "inlined",
      linkReferenceStyle: "full",
      br: "  ",
      preformattedCode: false,
      blankReplacement: function(content, node) {
        return node.isBlock ? "\n\n" : "";
      },
      keepReplacement: function(content, node) {
        return node.isBlock ? "\n\n" + node.outerHTML + "\n\n" : node.outerHTML;
      },
      defaultReplacement: function(content, node) {
        return node.isBlock ? "\n\n" + content + "\n\n" : content;
      }
    };
    this.options = extend({}, defaults, options);
    this.rules = new Rules(this.options);
  }
  TurndownService.prototype = {
    /**
     * The entry point for converting a string or DOM node to Markdown
     * @public
     * @param {String|HTMLElement} input The string or DOM node to convert
     * @returns A Markdown representation of the input
     * @type String
     */
    turndown: function(input) {
      if (!canConvert(input)) {
        throw new TypeError(input + " is not a string, or an element/document/fragment node.");
      }
      if (input === "") return "";
      var output = process.call(this, new RootNode(input, this.options));
      return postProcess.call(this, output);
    },
    /**
     * Add one or more plugins
     * @public
     * @param {Function|Array} plugin The plugin or array of plugins to add
     * @returns The Turndown instance for chaining
     * @type Object
     */
    use: function(plugin) {
      if (Array.isArray(plugin)) {
        for (var i = 0; i < plugin.length; i++) this.use(plugin[i]);
      } else if (typeof plugin === "function") {
        plugin(this);
      } else {
        throw new TypeError("plugin must be a Function or an Array of Functions");
      }
      return this;
    },
    /**
     * Adds a rule
     * @public
     * @param {String} key The unique key of the rule
     * @param {Object} rule The rule
     * @returns The Turndown instance for chaining
     * @type Object
     */
    addRule: function(key, rule) {
      this.rules.add(key, rule);
      return this;
    },
    /**
     * Keep a node (as HTML) that matches the filter
     * @public
     * @param {String|Array|Function} filter The unique key of the rule
     * @returns The Turndown instance for chaining
     * @type Object
     */
    keep: function(filter) {
      this.rules.keep(filter);
      return this;
    },
    /**
     * Remove a node that matches the filter
     * @public
     * @param {String|Array|Function} filter The unique key of the rule
     * @returns The Turndown instance for chaining
     * @type Object
     */
    remove: function(filter) {
      this.rules.remove(filter);
      return this;
    },
    /**
     * Escapes Markdown syntax
     * @public
     * @param {String} string The string to escape
     * @returns A string with Markdown syntax escaped
     * @type String
     */
    escape: function(string) {
      return escapeMarkdown(string);
    }
  };
  function process(parentNode) {
    var self = this;
    return reduce.call(parentNode.childNodes, function(output, node) {
      node = new Node(node, self.options);
      var replacement = "";
      if (node.nodeType === 3) {
        replacement = node.isCode ? node.nodeValue : self.escape(node.nodeValue);
      } else if (node.nodeType === 1) {
        replacement = replacementForNode.call(self, node);
      }
      return join(output, replacement);
    }, "");
  }
  function postProcess(output) {
    var self = this;
    this.rules.forEach(function(rule) {
      if (typeof rule.append === "function") {
        output = join(output, rule.append(self.options));
      }
    });
    return output.replace(/^[\t\r\n]+/, "").replace(/[\t\r\n\s]+$/, "");
  }
  function replacementForNode(node) {
    var rule = this.rules.forNode(node);
    var content = process.call(this, node);
    var whitespace = node.flankingWhitespace;
    if (whitespace.leading || whitespace.trailing) content = content.trim();
    return whitespace.leading + rule.replacement(content, node, this.options) + whitespace.trailing;
  }
  function join(output, replacement) {
    var s1 = trimTrailingNewlines(output);
    var s2 = trimLeadingNewlines(replacement);
    var nls = Math.max(output.length - s1.length, replacement.length - s2.length);
    var separator = "\n\n".substring(0, nls);
    return s1 + separator + s2;
  }
  function canConvert(input) {
    return input != null && (typeof input === "string" || input.nodeType && (input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11));
  }

  // src/core/dom.ts
  var turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced"
  });
  turndown.addRule("citations", {
    filter: (node) => node.nodeName === "A" && Boolean(node.href) && /^\s*\[?\d+\]?\s*$/.test(node.textContent || ""),
    replacement: (content, node) => `[${content.trim().replace(/^\[|\]$/g, "")}](${node.href})`
  });
  function firstText(document2, selectors) {
    for (const selector of selectors) {
      const text = document2.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    return void 0;
  }
  function roleFromElement(element, fallback = "unknown") {
    const signal = [
      element.getAttribute("data-message-author-role"),
      element.getAttribute("data-author"),
      element.getAttribute("aria-label"),
      element.className,
      element.tagName
    ].join(" ").toLowerCase();
    if (/(^|\W)(user|human|you)(\W|$)/.test(signal)) return "user";
    if (/(assistant|bot|model|claude|gemini|qwen|chatgpt)/.test(signal)) return "assistant";
    if (/system/.test(signal)) return "system";
    if (/tool/.test(signal)) return "tool";
    return fallback;
  }
  function collectCitations(element) {
    return Array.from(element.querySelectorAll("a[href]")).map((anchor) => ({
      label: anchor.textContent?.trim() || new URL(anchor.href).hostname,
      url: anchor.href
    })).filter(
      (citation, index, all) => all.findIndex((candidate) => candidate.url === citation.url) === index
    );
  }
  function collectAttachments(element) {
    const attachments = [];
    element.querySelectorAll("a[download], a[href]").forEach((anchor) => {
      const name = anchor.getAttribute("download") || anchor.textContent?.trim();
      if (!name || name.length > 160) return;
      const signal = `${anchor.className} ${anchor.getAttribute("aria-label") || ""}`.toLowerCase();
      if (/(attachment|artifact|file|download)/.test(signal)) {
        attachments.push({ name, url: anchor.href, kind: signal.includes("artifact") ? "artifact" : "file" });
      }
    });
    element.querySelectorAll("img[src]").forEach((image) => {
      const name = image.alt?.trim();
      if (name) attachments.push({ name, url: image.src, kind: "image" });
    });
    return attachments.filter(
      (item, index, all) => all.findIndex((candidate) => candidate.name === item.name && candidate.url === item.url) === index
    );
  }
  function messageFromElement(element, role) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll("button, textarea, input, nav, [contenteditable='true']").forEach((node) => node.remove());
    const markdown = turndown.turndown(clone.innerHTML).trim();
    return {
      role: role || roleFromElement(element),
      markdown,
      plainText: element.textContent?.trim() || "",
      citations: collectCitations(element),
      attachments: collectAttachments(element)
    };
  }
  function dedupeNested(elements) {
    const unique = [...new Set(elements)];
    return unique.filter(
      (element, index) => !unique.some(
        (candidate, candidateIndex) => candidateIndex !== index && candidate.contains(element)
      )
    );
  }
  function possibleVirtualization(document2) {
    return Boolean(document2.querySelector(
      "[data-virtualized], [style*='translateY'], [aria-rowcount], .virtualized"
    ));
  }
  function queryComposedAll(selectors, document2 = window.document) {
    const results = [];
    const visited = /* @__PURE__ */ new Set();
    const visit = (root2) => {
      if (visited.has(root2)) return;
      visited.add(root2);
      for (const selector of selectors) {
        try {
          results.push(...Array.from(root2.querySelectorAll(selector)));
        } catch {
        }
      }
      root2.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot) visit(element.shadowRoot);
      });
      root2.querySelectorAll("iframe").forEach((frame) => {
        try {
          if (frame.contentDocument && frame.contentDocument.location.origin === location.origin) {
            visit(frame.contentDocument);
          }
        } catch {
        }
      });
    };
    visit(document2);
    return [...new Set(results)];
  }
  var SEMANTIC_SELECTORS = [
    "[data-message-author-role]",
    "[data-message-role]",
    "[data-role='user']",
    "[data-role='assistant']",
    "[role='article']",
    "main article",
    "main [class*='message']",
    "main [class*='Message']",
    "main [class*='turn']",
    "main [class*='Turn']",
    "main [class*='response']",
    "main [class*='Response']"
  ];
  function isUsableMessage(element) {
    if (element.closest("nav, aside, header, footer, [role='navigation'], [aria-hidden='true']")) {
      return false;
    }
    const text = element.textContent?.trim() || "";
    if (text.length < 2 || text.length > 25e4) return false;
    if (element.matches("button, form, textarea, input, [contenteditable='true']")) return false;
    return true;
  }
  function semanticExtraction(document2) {
    const raw = queryComposedAll(SEMANTIC_SELECTORS, document2).filter(isUsableMessage);
    const elements = dedupeNested(raw);
    const roleCount = elements.filter((element) => roleFromElement(element) !== "unknown").length;
    const mainCount = elements.filter((element) => Boolean(element.closest("main, [role='main']"))).length;
    const alternating = elements.length >= 2 ? elements.reduce((count, element, index) => {
      if (!index) return count;
      const current = roleFromElement(element);
      const prior = roleFromElement(elements[index - 1]);
      return count + (current !== "unknown" && prior !== "unknown" && current !== prior ? 1 : 0);
    }, 0) : 0;
    let confidence = 0.12;
    if (elements.length >= 2) confidence += 0.22;
    if (elements.length >= 4) confidence += 0.13;
    confidence += Math.min(0.25, roleCount / Math.max(1, elements.length) * 0.25);
    confidence += Math.min(0.13, mainCount / Math.max(1, elements.length) * 0.13);
    if (alternating >= Math.max(1, elements.length / 3)) confidence += 0.1;
    return {
      elements,
      confidence: Math.min(0.95, confidence),
      reasons: [
        `${elements.length} repeated message blocks`,
        `${roleCount} explicit speaker signals`,
        `${mainCount} candidates inside the primary content region`
      ]
    };
  }

  // src/adapters/selector-adapter.ts
  function createSelectorAdapter(config) {
    return {
      id: config.id,
      displayName: config.displayName,
      adapterVersion: 1,
      hostPatterns: config.hosts,
      matches: (url) => config.hosts.includes(url.hostname),
      detect(document2) {
        const count = config.messageSelectors.reduce(
          (total, selector) => total + document2.querySelectorAll(selector).length,
          0
        );
        return {
          confidence: count > 1 ? 0.95 : count === 1 ? 0.6 : 0,
          reason: `${count} message candidates`
        };
      },
      async extract(document2) {
        const elements = dedupeNested(
          config.messageSelectors.flatMap(
            (selector) => Array.from(document2.querySelectorAll(selector))
          )
        );
        const messages = elements.map(
          (element, index) => messageFromElement(element, config.role?.(element, index) || roleFromElement(
            element,
            index % 2 === 0 ? "user" : "assistant"
          ))
        ).filter((message) => message.plainText || message.markdown);
        const context = {};
        for (const [key, selectors] of Object.entries(config.contextSelectors || {})) {
          const value = firstText(document2, selectors);
          if (value) context[key] = value;
        }
        const virtualized = possibleVirtualization(document2);
        return {
          title: firstText(document2, config.titleSelectors) || document2.title.replace(/\s*[-|]\s*(Gemini|ChatGPT|Claude|Qwen|Google AI Mode).*$/i, "").trim() || `${config.displayName} conversation`,
          context,
          messages,
          completeness: virtualized ? "possibly-truncated" : "complete",
          warnings: virtualized ? ["This page may virtualize older messages. Scroll to the beginning and retry for a complete capture."] : []
        };
      },
      getNewChatTarget(document2) {
        for (const selector of config.newChatSelectors || []) {
          const target = document2.querySelector(selector)?.href;
          if (target) return target;
        }
        return null;
      }
    };
  }

  // src/adapters/chatgpt.ts
  var chatgptAdapter = createSelectorAdapter({
    id: "chatgpt",
    displayName: "ChatGPT",
    hosts: ["chatgpt.com"],
    messageSelectors: [
      "article[data-testid^='conversation-turn']",
      "[data-message-author-role]"
    ],
    titleSelectors: [
      "nav a[aria-current='page']",
      "h1",
      "title"
    ],
    contextSelectors: {
      project: ["[data-testid='project-title']", "[aria-label^='Project']"]
    },
    newChatSelectors: ["a[data-testid='create-new-chat-button']", "a[href='/']"]
  });

  // src/adapters/claude.ts
  var claudeAdapter = createSelectorAdapter({
    id: "claude",
    displayName: "Claude",
    hosts: ["claude.ai"],
    messageSelectors: [
      "[data-testid='user-message']",
      "[data-testid='assistant-message']",
      "[data-is-streaming]",
      ".font-claude-message"
    ],
    titleSelectors: [
      "[data-testid='conversation-title']",
      "header h1",
      "h1"
    ],
    contextSelectors: {
      project: ["[data-testid='project-name']", "[aria-label^='Project']"]
    },
    newChatSelectors: ["a[href='/new']", "a[aria-label='New chat']"]
  });

  // src/adapters/gemini.ts
  var geminiAdapter = createSelectorAdapter({
    id: "gemini",
    displayName: "Gemini",
    hosts: ["gemini.google.com"],
    messageSelectors: [
      "#chat-history user-query-content",
      "#chat-history bot-response-content",
      "#chat-history model-response"
    ],
    titleSelectors: [
      "h1",
      "h2[data-sourcepos]",
      "[data-test-id='conversation-title']"
    ],
    contextSelectors: {
      notebook: [
        "[data-test-id='notebook-title']",
        "[data-testid='notebook-title']",
        "[aria-label^='Notebook:']"
      ]
    },
    newChatSelectors: ["a[aria-label='New chat']", "a[href='/app']"]
  });

  // src/adapters/generic.ts
  var genericAdapter = {
    id: "generic",
    displayName: "Generic chatbot",
    adapterVersion: 1,
    hostPatterns: [],
    matches: () => true,
    detect(document2) {
      const result = semanticExtraction(document2);
      return {
        confidence: result.confidence,
        reason: result.reasons.join("; ")
      };
    },
    async extract(document2) {
      const result = semanticExtraction(document2);
      const selected = result.elements.filter(
        (element) => element.hasAttribute("data-ai-chat-selected")
      );
      const source = selected.length ? selected : result.elements;
      return {
        title: document2.title || "AI conversation",
        messages: source.map((element, index) => {
          const assigned = element.getAttribute("data-ai-chat-role");
          return messageFromElement(element, assigned || (index % 2 === 0 ? "user" : "assistant"));
        }),
        completeness: "possibly-truncated",
        warnings: [
          `Local semantic detection confidence: ${Math.round(result.confidence * 100)}%. Review speaker roles and content before relying on the export.`
        ]
      };
    }
  };

  // src/core/platforms.ts
  function isGoogleAiModeUrl(url) {
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "google.com") return false;
    if (url.pathname === "/ai" || url.pathname.startsWith("/ai/")) return true;
    if (url.pathname === "/aimode" || url.pathname.startsWith("/aimode/")) return true;
    if (url.pathname === "/search" && url.searchParams.get("udm") === "50") return true;
    if (url.pathname === "/search" && /(^|[&?])ai_mode=/.test(url.search)) return true;
    return false;
  }

  // src/adapters/google-ai-mode.ts
  var MESSAGE_SELECTORS = [
    "[data-message-author-role]",
    "[data-message-role]",
    "[data-author]",
    "[data-role='user']",
    "[data-role='assistant']",
    "[role='article']",
    "main article",
    "main [class*='message']",
    "main [class*='Message']",
    "main [class*='response']",
    "main [class*='Response']",
    "main [class*='answer']",
    "main [class*='Answer']",
    "main [class*='query']",
    "main [class*='Query']"
  ];
  function usable(element) {
    if (element.closest("nav, aside, header, footer, [role='navigation'], [aria-hidden='true']")) {
      return false;
    }
    if (element.matches("button, form, textarea, input, [contenteditable='true']")) return false;
    const text = element.textContent?.trim() || "";
    if (text.length < 2 || text.length > 25e4) return false;
    return true;
  }
  function googleRole(element, index) {
    const explicit = roleFromElement(element);
    if (explicit !== "unknown") return explicit;
    const signal = [
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-role"),
      element.className,
      element.id
    ].join(" ").toLowerCase();
    if (/(^|\W)(you|your|user|query|question|prompt)(\W|$)/.test(signal)) return "user";
    if (/(ai\s*mode|assistant|answer|response|overview|gemini)/.test(signal)) return "assistant";
    return index % 2 === 0 ? "user" : "assistant";
  }
  function titleFor(document2) {
    return firstText(document2, [
      "h1",
      "main h1",
      "[data-attrid='title']",
      "[role='heading'][aria-level='1']"
    ]) || document2.title.replace(/\s*[-|]\s*(Google Search|Google|AI Mode).*$/i, "").replace(/^AI Mode\s*[-|]\s*/i, "").trim() || "Google AI Mode conversation";
  }
  function visibleText(element) {
    const htmlElement = element;
    const style = typeof getComputedStyle === "function" ? getComputedStyle(htmlElement) : void 0;
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
      return "";
    }
    return element.textContent?.replace(/\s+/g, " ").trim() || "";
  }
  function shouldSkipTextParent(element) {
    return Boolean(element.closest([
      "script",
      "style",
      "noscript",
      "svg",
      "canvas",
      "nav",
      "aside",
      "header",
      "footer",
      "button",
      "form",
      "textarea",
      "input",
      "[contenteditable='true']",
      "[role='navigation']",
      "[aria-hidden='true']"
    ].join(",")));
  }
  function inLikelySourceRail(element) {
    const rect = element.getBoundingClientRect?.();
    const viewportWidth = typeof innerWidth === "number" ? innerWidth : 0;
    if (!rect || !viewportWidth || rect.width === 0) return false;
    return rect.left > viewportWidth * 0.55 && rect.width < viewportWidth * 0.5;
  }
  function isGoogleUiText(text) {
    return /^(AI Mode|All|Images|Videos|News|More|Upgrade|Ask anything|Skip to main content|Accessibility help|See my AI Mode history|Search Results|AI Mode history|Recent|You said:)$/i.test(text) || /^.+ - Google Search$/i.test(text) || /^Something went wrong\./i.test(text) || /^what'?s on your mind\??$/i.test(text) || /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text);
  }
  function isPostAnswerUiText(text) {
    return /^(Share public link|This public link shares a thread|A copy of this chat|Your feedback will include|Thanks for letting us know|Google may use account and system data|Terms of Service|make a legal removal request)$/i.test(text);
  }
  function cleanAssistantMarkdown(markdown, query) {
    let value = markdown.replace(query, "").trim();
    const stop = value.search(/\b(Share public link|This public link shares a thread|A copy of this chat|Your feedback will include|Thanks for letting us know|Google may use account and system data)\b/i);
    if (stop >= 0) value = value.slice(0, stop).trim();
    value = value.split(/\n+/).map((line) => line.trim()).filter((line) => line && !isGoogleUiText(line) && !isPostAnswerUiText(line)).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    return repairQueryTermGaps(value, query);
  }
  function queryTerm(query) {
    const cleaned = query.replace(/[?!.]+$/g, "").replace(/^(what|who|where|when|why|how)\s+(is|are|was|were|do|does|did|to)\s+/i, "").replace(/^(explain|define|describe)\s+/i, "").trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    return words.length ? words[words.length - 1] : cleaned;
  }
  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function repairQueryTermGaps(markdown, query) {
    const term = queryTerm(query);
    if (!term || term.length > 40) return markdown;
    const escaped = escapeRegExp(term);
    let value = markdown;
    value = value.replace(new RegExp(`^is a powerful command-line utility`, "im"), `${term} is a powerful command-line utility`).replace(new RegExp(`\\bHow\\s+Works\\b`, "g"), `How ${term} Works`).replace(new RegExp(`\\bBy default,\\s+reads\\b`, "g"), `By default, ${term} reads`).replace(new RegExp(`\\bYou can use\\s+to scan\\b`, "g"), `You can use ${term} to scan`).replace(new RegExp(`\\bCombine\\s+with other commands\\b`, "g"), `Combine ${term} with other commands`).replace(new RegExp(`\\bModifiers can drastically alter how\\s+finds\\b`, "g"), `Modifiers can drastically alter how ${term} finds`).replace(new RegExp(`\\bBasic Regex Examples with\\s+becomes\\b`, "g"), `Basic Regex Examples with ${term}

${term} becomes`).replace(new RegExp(`\\bThe basic syntax is:\\s+${escaped}\\s+\\[options\\]`, "i"), `The basic syntax is:

${term} [options]`);
    if (term.toLowerCase() === "grep") {
      value = value.replace(/\bThe name stands for\s+lobal\s+egular\s+xpression\s+rint\b/gi, "The name stands for Global Regular Expression Print").replace(/\bThe name stands for\s+rint\b/gi, "The name stands for Global Regular Expression Print").replace(/\(\s+g\/re\/p\s+\)/g, "(g/re/p)").replace(/\(\s*\)\s+that meant/gi, "(g/re/p) that meant");
    }
    return value.replace(/\n{3,}/g, "\n\n").trim();
  }
  function artifactScore(markdown) {
    const patterns = [
      /^\s*is a powerful command-line utility/im,
      /The name stands for\s+rint/i,
      /stemming from.*command\s*\(\s*\)/is,
      /\nreads through text line-by-line/i,
      /Common Ways to Use\s+to scan/i,
      /how\s+finds or displays data/i,
      /Basic Regex Examples with\s+becomes/i
    ];
    return patterns.reduce((score, pattern) => score + (pattern.test(markdown) ? 1 : 0), 0);
  }
  function chooseAssistantBlocks(candidates, query) {
    const scored = candidates.filter((blocks) => blocks.length).map((blocks) => {
      const markdown = cleanAssistantMarkdown(blocks.join("\n\n"), query);
      return {
        blocks,
        markdown,
        score: markdown.length - artifactScore(markdown) * 1e4
      };
    }).filter((candidate) => candidate.markdown.length >= 12).sort((a, b) => b.score - a.score);
    return scored[0]?.blocks || [];
  }
  function composedTextRuns(document2) {
    const runs = [];
    const visited = /* @__PURE__ */ new Set();
    const addText = (value) => {
      const text = value.replace(/\s+/g, " ").trim();
      if (text.length < 2 || text.length > 25e3) return;
      if (isGoogleUiText(text) || isPostAnswerUiText(text)) return;
      if (!runs.includes(text)) runs.push(text);
    };
    const visit = (root2) => {
      if (visited.has(root2)) return;
      visited.add(root2);
      const owner = root2 instanceof Document ? root2 : root2.ownerDocument;
      const walker = owner.createTreeWalker(root2, NodeFilter.SHOW_TEXT, {
        acceptNode(node2) {
          const text = node2.textContent?.replace(/\s+/g, " ").trim() || "";
          if (text.length < 2) return NodeFilter.FILTER_REJECT;
          const parent = node2.parentElement;
          if (!parent || shouldSkipTextParent(parent)) return NodeFilter.FILTER_REJECT;
          if (inLikelySourceRail(parent)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node = walker.nextNode();
      while (node) {
        addText(node.textContent || "");
        node = walker.nextNode();
      }
      root2.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot) visit(element.shadowRoot);
      });
      root2.querySelectorAll("iframe").forEach((frame) => {
        try {
          if (frame.contentDocument && frame.contentDocument.location.origin === location.origin) {
            visit(frame.contentDocument);
          }
        } catch {
        }
      });
    };
    visit(document2);
    return runs;
  }
  function composedElementBlocks(document2) {
    const selectors = [
      "main p",
      "main li",
      "main h1",
      "main h2",
      "main h3",
      "main h4",
      "main pre",
      "main code",
      "main blockquote",
      "main tr",
      "[role='main'] p",
      "[role='main'] li",
      "[role='main'] h1",
      "[role='main'] h2",
      "[role='main'] h3",
      "[role='main'] h4",
      "[role='main'] pre",
      "[role='main'] code",
      "[role='main'] blockquote",
      "[role='main'] tr"
    ];
    const blocks = [];
    for (const element of queryComposedAll(selectors, document2)) {
      if (shouldSkipTextParent(element) || inLikelySourceRail(element)) continue;
      const text = visibleText(element);
      if (text.length < 2 || text.length > 25e3) continue;
      if (isGoogleUiText(text) || isPostAnswerUiText(text)) continue;
      if (!blocks.includes(text)) blocks.push(text);
    }
    return blocks;
  }
  function hasVisibleBox(element) {
    const rect = element.getBoundingClientRect?.();
    if (!rect) return true;
    return rect.width > 0 && rect.height > 0;
  }
  function nearestUsefulBlock(element) {
    let current = element;
    for (let depth = 0; depth < 5 && current.parentElement; depth += 1) {
      const parent = current.parentElement;
      if (parent.matches("main, [role='main'], body")) break;
      const text = visibleText(parent);
      if (text.length > 1600) break;
      current = parent;
    }
    return current;
  }
  function visibleAiModeBlocks(document2) {
    const roots = queryComposedAll(["main", "[role='main']"], document2);
    const root2 = roots[0] || document2.body;
    if (!root2) return [];
    const candidates = Array.from(root2.querySelectorAll([
      "article",
      "[role='article']",
      "[role='heading']",
      "h1",
      "h2",
      "h3",
      "p",
      "li",
      "pre",
      "blockquote",
      "[data-attrid]",
      "[data-md]",
      "[jsname]",
      "div"
    ].join(","))).filter((element) => {
      if (!usable(element) || !hasVisibleBox(element)) return false;
      const text = visibleText(element);
      if (text.length < 24 || text.length > 2e4) return false;
      if (isGoogleUiText(text) || isPostAnswerUiText(text)) return false;
      if (inLikelySourceRail(element)) return false;
      return true;
    }).map(nearestUsefulBlock);
    const deduped = dedupeNested(candidates);
    const byText = /* @__PURE__ */ new Map();
    for (const element of deduped) {
      const text = visibleText(element);
      if (!text) continue;
      const key = text.slice(0, 500);
      const existing = byText.get(key);
      if (!existing || visibleText(existing).length < text.length) byText.set(key, element);
    }
    return [...byText.values()].slice(0, 80);
  }
  function fallbackMessages(document2) {
    const blocks = visibleAiModeBlocks(document2);
    const title = titleFor(document2);
    const href = document2.location?.href || (typeof location !== "undefined" ? location.href : "");
    const query = href ? new URL(href).searchParams.get("q") || title : title;
    const messages = [];
    if (query && query.length >= 2) {
      messages.push({
        role: "user",
        markdown: query,
        plainText: query,
        citations: [],
        attachments: []
      });
    }
    const blockCandidate = blocks.filter((element) => {
      const text = visibleText(element);
      return text && text !== query && !text.includes("Ask anything") && !isGoogleUiText(text) && !isPostAnswerUiText(text) && !inLikelySourceRail(element);
    }).map((element) => turndown.turndown(element.innerHTML).trim()).filter(
      (markdown, index, all) => markdown.length >= 12 && all.findIndex((candidate) => candidate === markdown) === index
    );
    const elementCandidate = composedElementBlocks(document2).filter(
      (text, index, all) => text !== query && !text.includes("Ask anything") && !isGoogleUiText(text) && !isPostAnswerUiText(text) && all.indexOf(text) === index
    );
    const textCandidate = composedTextRuns(document2).filter(
      (text, index, all) => text !== query && !text.includes("Ask anything") && !isGoogleUiText(text) && !isPostAnswerUiText(text) && all.indexOf(text) === index
    );
    let assistantBlocks = chooseAssistantBlocks([blockCandidate, elementCandidate, textCandidate], query);
    if (!assistantBlocks.length) {
      const rootText = visibleText(queryComposedAll(["main", "[role='main']"], document2)[0] || document2.body).replace(/^AI Mode\s*/i, "").replace(/Ask anything[\s\S]*$/i, "").trim();
      if (rootText && rootText !== query) {
        assistantBlocks = [rootText.replace(query, "").trim() || rootText];
      }
    }
    if (assistantBlocks.length) {
      const assistantMarkdown = cleanAssistantMarkdown(assistantBlocks.join("\n\n"), query);
      messages.push({
        role: "assistant",
        markdown: assistantMarkdown,
        plainText: assistantMarkdown.replace(/[#*_`>~-]/g, "").replace(/\n{3,}/g, "\n\n").trim(),
        citations: [],
        attachments: []
      });
    }
    return messages;
  }
  var googleAiModeAdapter = {
    id: "google-ai-mode",
    displayName: "Google AI Mode",
    adapterVersion: 1,
    hostPatterns: ["google.com", "www.google.com"],
    matches: isGoogleAiModeUrl,
    detect(document2) {
      const semantic = semanticExtraction(document2);
      const googleCandidates = dedupeNested(queryComposedAll(MESSAGE_SELECTORS, document2).filter(usable));
      const fallbackCount = visibleAiModeBlocks(document2).length;
      const count = Math.max(semantic.elements.length, googleCandidates.length, fallbackCount);
      return {
        confidence: count >= 2 ? Math.max(0.76, semantic.confidence) : semantic.confidence,
        reason: `${count} Google AI Mode message candidates`
      };
    },
    async extract(document2) {
      const googleCandidates = dedupeNested(queryComposedAll(MESSAGE_SELECTORS, document2).filter(usable));
      const semantic = semanticExtraction(document2);
      const source = googleCandidates.length >= 2 ? googleCandidates : semantic.elements;
      const virtualized = possibleVirtualization(document2);
      const extracted = source.length ? source.map(
        (element, index) => messageFromElement(element, googleRole(element, index))
      ).filter((message) => message.plainText || message.markdown) : [];
      const messages = extracted.length >= 2 ? extracted : fallbackMessages(document2);
      return {
        title: titleFor(document2),
        context: {
          surface: "Google Search AI Mode"
        },
        messages,
        completeness: virtualized ? "possibly-truncated" : "complete",
        warnings: virtualized ? ["Google AI Mode may virtualize older content. Scroll through the thread before capture."] : []
      };
    },
    getNewChatTarget() {
      return "https://www.google.com/ai";
    }
  };

  // src/adapters/bundled-profiles.ts
  var timestamp = "2026-06-22T00:00:00.000Z";
  var commonMessages = [
    "[data-message-author-role]",
    "[data-role='user']",
    "[data-role='assistant']",
    "[data-testid*='message']",
    "article",
    "[class*='message']",
    "[class*='Message']",
    "[class*='turn']"
  ];
  var profile = (id, name, origin, messages = commonMessages, overrides = {}) => ({
    schemaVersion: 1,
    id,
    name,
    source: "bundled",
    origins: [origin],
    pathPatterns: ["/*"],
    selectors: overrides.selectors || {
      conversation: "main",
      messages,
      exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
    },
    roles: overrides.roles || {
      strategy: "attribute",
      attribute: "data-message-author-role",
      userValues: ["user", "human"],
      assistantValues: ["assistant", "model", "bot"]
    },
    confidence: overrides.confidence || 0.78,
    createdAt: timestamp,
    updatedAt: timestamp
  });
  var BUNDLED_PROFILES = [
    profile("z-ai", "Z.ai", "https://chat.z.ai", [
      "[id^='message-']:not([id$='-start'])"
    ], {
      selectors: {
        messages: ["[id^='message-']:not([id$='-start'])"],
        exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
      },
      roles: {
        strategy: "selectors",
        userSelectors: [".user-message"],
        assistantSelectors: ["[id^='message-']:not(.user-message):not([id$='-start'])"],
        startsWith: "user"
      },
      confidence: 0.95
    }),
    profile("mistral-vibe", "Mistral Vibe", "https://chat.mistral.ai"),
    profile("ai2-playground", "Ai2 Playground", "https://playground.allenai.org", [
      ".chat-message[data-messageid]"
    ], {
      selectors: {
        conversation: "main",
        messages: [".chat-message[data-messageid]"],
        content: ".MuiTypography-body1",
        exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
      },
      roles: {
        strategy: "selectors",
        userSelectors: [".chat-message[data-messageid]"],
        assistantSelectors: ["[data-is-streaming]"],
        startsWith: "user"
      },
      confidence: 0.95
    }),
    profile("deepseek", "DeepSeek Chat", "https://chat.deepseek.com", [".ds-message"], {
      selectors: {
        messages: [".ds-message"],
        exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
      },
      roles: {
        strategy: "selectors",
        userSelectors: [".ds-message"],
        assistantSelectors: [".ds-assistant-message-main-content"],
        startsWith: "user"
      },
      confidence: 0.95
    })
  ];

  // src/adapters/profile-adapter.ts
  function profileElements(profile2, document2) {
    const roots = profile2.selectors.conversation ? queryComposedAll([profile2.selectors.conversation], document2) : [document2.documentElement];
    const candidates = roots.flatMap(
      (root2) => profile2.selectors.messages.flatMap((selector) => {
        try {
          return Array.from(root2.querySelectorAll(selector));
        } catch {
          return [];
        }
      })
    );
    const excluded = profile2.selectors.exclude || [];
    return dedupeNested(candidates).filter(
      (element) => !excluded.some((selector) => {
        try {
          return element.matches(selector) || Boolean(element.closest(selector));
        } catch {
          return false;
        }
      })
    );
  }
  function roleFor(profile2, element, index) {
    const roles = profile2.roles;
    if (roles.strategy === "attribute" && roles.attribute) {
      const value = (element.getAttribute(roles.attribute) || "").toLowerCase();
      if (roles.userValues?.some((candidate) => value.includes(candidate.toLowerCase()))) return "user";
      if (roles.assistantValues?.some((candidate) => value.includes(candidate.toLowerCase()))) {
        return "assistant";
      }
    }
    if (roles.strategy === "selectors") {
      const matches = (selector) => {
        try {
          return element.matches(selector) || Boolean(element.querySelector(selector));
        } catch {
          return false;
        }
      };
      if (roles.assistantSelectors?.some(matches)) return "assistant";
      if (roles.userSelectors?.some(matches)) return "user";
    }
    const inferred = roleFromElement(element);
    if (inferred !== "unknown") return inferred;
    const startsUser = roles.startsWith !== "assistant";
    return index % 2 === 0 === startsUser ? "user" : "assistant";
  }
  function createProfileAdapter(profile2) {
    return {
      id: `profile:${profile2.id}`,
      displayName: profile2.name,
      adapterVersion: profile2.schemaVersion,
      hostPatterns: profile2.origins,
      matches: (url) => profile2.origins.includes(url.origin) && profile2.pathPatterns.some((path) => path === "/*" || url.pathname.startsWith(path.replace(/\*.*$/, ""))),
      detect(document2) {
        const count = profileElements(profile2, document2).length;
        const health = count >= 2 ? profile2.confidence : Math.min(0.4, profile2.confidence / 2);
        return { confidence: health, reason: `${count} profile-matched messages` };
      },
      async extract(document2) {
        const elements = profileElements(profile2, document2);
        const title = profile2.selectors.title ? queryComposedAll([profile2.selectors.title], document2)[0]?.textContent?.trim() : void 0;
        const warnings = [];
        if (elements.length < 2) warnings.push("This site profile may be outdated. Recalibration is recommended.");
        if (possibleVirtualization(document2)) {
          warnings.push("This page may virtualize older messages; scroll through the thread before capture.");
        }
        return {
          title: title || document2.title || `${profile2.name} conversation`,
          messages: elements.map((element, index) => {
            let content = element;
            if (profile2.selectors.content) {
              try {
                content = element.querySelector(profile2.selectors.content) || element;
              } catch {
                content = element;
              }
            }
            return messageFromElement(content, roleFor(profile2, element, index));
          }),
          completeness: warnings.length ? "possibly-truncated" : "complete",
          warnings
        };
      }
    };
  }

  // src/core/site-profiles.ts
  var STORAGE_KEY = "siteProfilesV1";
  var MAX_PROFILES = 100;
  var MAX_SELECTOR_LENGTH = 500;
  var now = () => (/* @__PURE__ */ new Date()).toISOString();
  function wildcardMatch(value, pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`).test(value);
  }
  function validSelector(selector) {
    if (typeof selector !== "string" || !selector.trim() || selector.length > MAX_SELECTOR_LENGTH) {
      return false;
    }
    if (/[{};]/.test(selector)) return false;
    if ((selector.match(/\[/g) || []).length !== (selector.match(/\]/g) || []).length) return false;
    if (typeof document === "undefined") return true;
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }
  function profileMatches(profile2, url) {
    return profile2.origins.includes(url.origin) && profile2.pathPatterns.some((pattern) => wildcardMatch(url.pathname, pattern));
  }
  function validateSiteProfile(value, source = "local") {
    if (!value || typeof value !== "object") throw new Error("Profile must be an object.");
    const input = value;
    if (input.schemaVersion !== 1) throw new Error("Unsupported profile schema.");
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(input.id || "")) throw new Error("Invalid profile ID.");
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 80) {
      throw new Error("Invalid profile name.");
    }
    const origins = Array.isArray(input.origins) ? input.origins.filter((origin) => {
      if (typeof origin !== "string") return false;
      try {
        const url = new URL(origin);
        return ["http:", "https:"].includes(url.protocol) && url.origin === origin;
      } catch {
        return false;
      }
    }) : [];
    if (!origins.length || origins.length > 10) throw new Error("Profile needs valid HTTP origins.");
    const paths = Array.isArray(input.pathPatterns) ? input.pathPatterns.filter((path) => typeof path === "string" && path.startsWith("/") && path.length <= 200) : [];
    if (!paths.length) throw new Error("Profile needs a path pattern.");
    const selectors = input.selectors;
    if (!selectors || !Array.isArray(selectors.messages) || !selectors.messages.length || !selectors.messages.every(validSelector)) {
      throw new Error("Profile needs valid message selectors.");
    }
    for (const selector of [selectors.conversation, selectors.content, selectors.title]) {
      if (selector !== void 0 && !validSelector(selector)) throw new Error("Invalid selector.");
    }
    if (selectors.exclude && !selectors.exclude.every(validSelector)) {
      throw new Error("Invalid exclusion selector.");
    }
    const roles = input.roles;
    if (!roles || !["attribute", "selectors", "alternating"].includes(roles.strategy)) {
      throw new Error("Invalid role strategy.");
    }
    if (roles.strategy === "attribute" && (!roles.attribute || roles.attribute.length > 100)) {
      throw new Error("Attribute role profiles require an attribute.");
    }
    if (roles.strategy === "selectors") {
      if (!Array.isArray(roles.userSelectors) || !Array.isArray(roles.assistantSelectors) || !roles.userSelectors.length || !roles.assistantSelectors.length || ![...roles.userSelectors, ...roles.assistantSelectors].every(validSelector)) {
        throw new Error("Invalid role selector.");
      }
    }
    for (const values of [roles.userValues, roles.assistantValues]) {
      if (values !== void 0 && (!Array.isArray(values) || values.some((value2) => typeof value2 !== "string" || value2.length > 80))) {
        throw new Error("Invalid role values.");
      }
    }
    return {
      schemaVersion: 1,
      id: input.id,
      name: input.name.trim(),
      source,
      origins,
      pathPatterns: paths,
      selectors: {
        conversation: selectors.conversation,
        messages: [...selectors.messages],
        content: selectors.content,
        title: selectors.title,
        exclude: selectors.exclude ? [...selectors.exclude] : void 0
      },
      roles: {
        strategy: roles.strategy,
        attribute: roles.attribute,
        userValues: roles.userValues ? [...roles.userValues] : void 0,
        assistantValues: roles.assistantValues ? [...roles.assistantValues] : void 0,
        userSelectors: roles.userSelectors ? [...roles.userSelectors] : void 0,
        assistantSelectors: roles.assistantSelectors ? [...roles.assistantSelectors] : void 0,
        startsWith: roles.startsWith
      },
      confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0.7)),
      createdAt: input.createdAt || now(),
      updatedAt: input.updatedAt || now(),
      needsRepair: Boolean(input.needsRepair)
    };
  }
  async function listLocalProfiles() {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    const values = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    return values.flatMap((value) => {
      try {
        return [validateSiteProfile(value)];
      } catch {
        return [];
      }
    });
  }
  async function saveLocalProfile(profile2) {
    const valid = validateSiteProfile({ ...profile2, updatedAt: now() });
    const profiles = await listLocalProfiles();
    const next2 = [valid, ...profiles.filter((item) => item.id !== valid.id)].slice(0, MAX_PROFILES);
    await chrome.storage.local.set({ [STORAGE_KEY]: next2 });
  }
  async function markProfileForRepair(id) {
    const profiles = await listLocalProfiles();
    const profile2 = profiles.find((item) => item.id === id);
    if (profile2) await saveLocalProfile({ ...profile2, needsRepair: true });
  }

  // src/adapters/qwen.ts
  var qwenAdapter = createSelectorAdapter({
    id: "qwen",
    displayName: "Qwen",
    hosts: ["chat.qwen.ai"],
    messageSelectors: [
      ".qwen-chat-message-user",
      ".qwen-chat-message-assistant",
      "[data-role='user']",
      "[data-role='assistant']",
      "[data-message-role]"
    ],
    titleSelectors: [
      "[data-testid='conversation-title']",
      "header h1",
      "h1"
    ],
    contextSelectors: {
      model: ["[data-testid='model-selector']", "[aria-label*='model' i]"]
    },
    role: (element, index) => {
      if (element.classList.contains("qwen-chat-message-user")) return "user";
      if (element.classList.contains("qwen-chat-message-assistant")) return "assistant";
      return index % 2 === 0 ? "user" : "assistant";
    },
    newChatSelectors: ["a[href='/']", "a[aria-label='New chat']"]
  });

  // src/adapters/registry.ts
  var adapters = [
    geminiAdapter,
    chatgptAdapter,
    claudeAdapter,
    qwenAdapter,
    googleAiModeAdapter
  ];
  async function resolveAdapter(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return genericAdapter;
    }
    const dedicated = adapters.find((adapter) => adapter.matches(url));
    if (dedicated) return dedicated;
    const local = (await listLocalProfiles()).find(
      (profile2) => !profile2.needsRepair && profileMatches(profile2, url)
    );
    if (local) return createProfileAdapter(local);
    const bundled = BUNDLED_PROFILES.find((profile2) => profileMatches(profile2, url));
    return bundled ? createProfileAdapter(bundled) : genericAdapter;
  }

  // src/core/transform.ts
  var roleLabel = (role) => ({
    user: "User",
    assistant: "Assistant",
    system: "System",
    tool: "Tool",
    unknown: "Message"
  })[role] || "Message";
  var yamlValue = (value) => JSON.stringify(value);
  function renderMarkdown(adapter, draft, sourceUrl, capturedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    const lines = [
      "---",
      `title: ${yamlValue(draft.title)}`,
      `platform: ${yamlValue(adapter.displayName)}`,
      `source: ${yamlValue(sourceUrl)}`,
      `captured_at: ${capturedAt}`,
      `completeness: ${draft.completeness || "complete"}`
    ];
    for (const [key, value] of Object.entries(draft.context || {})) {
      lines.push(`${key.replace(/\W+/g, "_").toLowerCase()}: ${yamlValue(value)}`);
    }
    lines.push("---", "");
    for (const message of draft.messages) {
      lines.push(`## ${roleLabel(message.role)}`, "", message.markdown || message.plainText, "", "---", "");
    }
    if (draft.warnings?.length) {
      lines.push("## Capture warnings", "", ...draft.warnings.map((warning) => `- ${warning}`), "");
    }
    return lines.join("\n");
  }
  function normalizeSnapshot(adapter, draft, sourceUrl) {
    const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
    return {
      schemaVersion: 2,
      platformId: adapter.id,
      platformName: adapter.displayName,
      adapterVersion: adapter.adapterVersion,
      title: draft.title,
      sourceUrl,
      capturedAt,
      context: draft.context || {},
      messages: draft.messages,
      renderedMarkdown: renderMarkdown(adapter, draft, sourceUrl, capturedAt),
      completeness: draft.completeness || "complete",
      warnings: draft.warnings || []
    };
  }
  function toJupyter(snapshot) {
    const cells = [{
      cell_type: "markdown",
      metadata: {},
      source: [`# ${snapshot.title}

**Platform:** ${snapshot.platformName}

**Source:** ${snapshot.sourceUrl}`]
    }];
    const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
    for (const message of snapshot.messages) {
      cells.push({ cell_type: "markdown", metadata: {}, source: [`**${roleLabel(message.role)}**`] });
      let last = 0;
      let match;
      while (match = fence.exec(message.markdown)) {
        const prose = message.markdown.slice(last, match.index).trim();
        if (prose) cells.push({ cell_type: "markdown", metadata: {}, source: [prose] });
        const code = match[2] || "";
        cells.push({
          cell_type: "code",
          execution_count: null,
          metadata: match[1] ? { language: match[1].trim() } : {},
          outputs: [],
          source: code.replace(/\n$/, "").split("\n").map(
            (line, index, all) => index < all.length - 1 ? `${line}
` : line
          )
        });
        last = fence.lastIndex;
      }
      const tail = message.markdown.slice(last).trim();
      if (tail) cells.push({ cell_type: "markdown", metadata: {}, source: [tail] });
    }
    return JSON.stringify({ cells, metadata: {}, nbformat: 4, nbformat_minor: 5 }, null, 2);
  }

  // src/core/download.ts
  function safeFilename(value, extension) {
    const base = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "ai-conversation";
    return `${base}.${extension}`;
  }
  function downloadText(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  // src/ui/launcher.ts
  var STYLE = `
  :host { all: initial; }
  button { position:fixed; right:20px; bottom:20px; z-index:2147483646; display:grid; width:48px;
    height:48px; place-items:center; border:1px solid #465166; border-radius:15px; color:#101319;
    background:#8ab4f8; box-shadow:0 18px 48px #0008; cursor:pointer; font:700 16px system-ui;
    transition:transform .16s ease, box-shadow .16s ease; }
  button:hover { transform:translateY(-3px); box-shadow:0 22px 58px #000a, 0 0 24px #8ab4f855; }
  button:focus-visible { outline:3px solid white; outline-offset:3px; }
`;
  function mountLauncher(onClick, position = "bottom-right") {
    const existing = document.querySelector("[data-ai-chat-launcher]");
    if (existing) existing.remove();
    const host = document.createElement("div");
    host.dataset.aiChatLauncher = "";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${STYLE}${position === "bottom-left" ? "button{right:auto;left:20px}" : ""}</style><button type="button" title="Open AI Chat Utilities" aria-label="Open AI Chat Utilities">AI</button>`;
    shadow.querySelector("button")?.addEventListener("click", onClick);
    document.documentElement.append(host);
    return () => host.remove();
  }

  // src/ui/overlay.ts
  var STYLE2 = `
  :host { all:initial; }
  .backdrop { position:fixed; inset:0; z-index:2147483647; display:grid; place-items:center;
    padding:20px; background:#07090db8; backdrop-filter:blur(10px); font:14px/1.45 system-ui,sans-serif; }
  .panel { width:min(560px,100%); border:1px solid #323b4b; border-radius:20px; color:#edf2f8;
    background:#111318; box-shadow:0 28px 90px #000c; overflow:hidden; }
  header { display:flex; justify-content:space-between; gap:20px; padding:22px 24px; border-bottom:1px solid #262d39; }
  .eyebrow { color:#8ab4f8; font-size:11px; font-weight:800; letter-spacing:.15em; text-transform:uppercase; }
  h2 { margin:5px 0 0; font-size:22px; } p { margin:7px 0 0; color:#919aab; }
  .close { border:0; color:#aeb7c5; background:transparent; cursor:pointer; font-size:22px; }
  .status { padding:15px 24px; border-bottom:1px solid #262d39; color:#bec7d5; background:#151922; }
  .warning { color:#f4c57a; }
  .preview { display:grid; gap:7px; max-height:156px; padding:14px 24px; overflow:auto; border-bottom:1px solid #262d39; }
  .message { display:grid; grid-template-columns:72px 1fr; gap:10px; color:#b7c0ce; font-size:12px; }
  .message b { color:#8ab4f8; font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
  .message span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:20px 24px 24px; }
  .action { min-height:86px; padding:14px; border:1px solid #303949; border-radius:12px; color:#e8edf5;
    background:#171b23; text-align:left; cursor:pointer; }
  .action:hover { border-color:#6684b7; background:#1b2330; }
  .action strong,.action span { display:block; }.action span { margin-top:5px;color:#8993a3;font-size:12px; }
  .action.primary { border-color:#5978a9; background:#182538; }
  @media(max-width:520px){.grid{grid-template-columns:1fr}}
`;
  var escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
  function showOverlay(adapter, snapshot, onAction, detection) {
    document.querySelector("[data-ai-chat-overlay]")?.remove();
    const host = document.createElement("div");
    host.dataset.aiChatOverlay = "";
    const shadow = host.attachShadow({ mode: "open" });
    const warning = snapshot?.warnings[0];
    const canCalibrate = adapter.id === "generic" || adapter.id.startsWith("profile:");
    const hasMessages = Boolean(snapshot?.messages.length);
    shadow.innerHTML = `<style>${STYLE2}</style><div class="backdrop"><section class="panel" role="dialog" aria-modal="true">
    <header><div><div class="eyebrow">${escapeHtml(adapter.displayName)}</div><h2>AI Chat Utilities</h2>
      <p>${hasMessages ? `${snapshot.messages.length} messages \xB7 ${escapeHtml(snapshot.title)}` : "No conversation detected yet."}</p></div>
      <button class="close" aria-label="Close">\xD7</button></header>
    <div class="status ${warning || !hasMessages ? "warning" : ""}">${warning ? escapeHtml(warning) : hasMessages ? `Conversation ready \xB7 ${Math.round((detection?.confidence || 1) * 100)}% extraction confidence.` : `No messages captured \xB7 ${Math.round((detection?.confidence || 0) * 100)}% extraction confidence.`}</div>
    ${hasMessages ? `<div class="preview">${snapshot.messages.slice(0, 6).map((message) => `<div class="message"><b>${message.role}</b><span></span></div>`).join("")}</div>` : ""}
    <div class="grid">
      <button class="action primary" data-action="markdown"><strong>Download Markdown</strong><span>Structured, portable conversation export.</span></button>
      <button class="action" data-action="copy"><strong>Copy Markdown</strong><span>Put the rendered conversation on the clipboard.</span></button>
      <button class="action" data-action="jupyter"><strong>Export Jupyter</strong><span>Split fenced code into executable cells.</span></button>
      <button class="action" data-action="archive"><strong>Save to Archive</strong><span>Store locally for search and retrieval.</span></button>
      ${canCalibrate ? `<button class="action" data-action="picker"><strong>${adapter.id === "generic" ? "Calibrate this site" : "Recalibrate profile"}</strong><span>Identify one user message, one assistant response, and the optional title.</span></button>` : ""}
      ${adapter.getNewChatTarget?.(document) ? `<button class="action" data-action="new-chat"><strong>New Chat</strong><span>Open this platform's new conversation page.</span></button>` : ""}
    </div></section></div>`;
    shadow.querySelector(".close")?.addEventListener("click", () => host.remove());
    shadow.querySelectorAll(".message span").forEach((element, index) => {
      element.textContent = snapshot?.messages[index]?.plainText || "";
    });
    shadow.querySelector(".backdrop")?.addEventListener("click", (event) => {
      if (event.target === shadow.querySelector(".backdrop")) host.remove();
    });
    shadow.querySelectorAll("[data-action]").forEach(
      (button) => button.addEventListener("click", () => {
        onAction(button.dataset.action);
        if (button.dataset.action !== "picker") host.remove();
      })
    );
    document.documentElement.append(host);
  }

  // src/ui/calibration.ts
  var STYLE3 = `
  :host{all:initial}.bar{position:fixed;left:50%;bottom:24px;z-index:2147483647;width:min(680px,calc(100% - 32px));
  transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #3c4657;
  border-radius:14px;background:#111318;color:#eef2f8;box-shadow:0 20px 60px #000b;font:13px/1.4 system-ui,sans-serif}
  .copy{min-width:0;flex:1}.step{color:#8ab4f8;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
  strong{display:block;margin-top:2px}button{border:1px solid #3c4657;border-radius:9px;padding:8px 11px;color:#d9e5f8;
  background:#1b1f27;cursor:pointer}button.primary{color:#101319;background:#8ab4f8;border-color:#8ab4f8;font-weight:700}
`;
  function escape(value) {
    return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
  }
  function stableSelector(element) {
    const attributes = [
      "data-testid",
      "data-message-id",
      "data-turn-id",
      "data-role",
      "data-message-author-role",
      "aria-label"
    ];
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (value && value.length <= 100) return `[${attribute}="${escape(value)}"]`;
    }
    const stableClass = Array.from(element.classList).find(
      (name) => name.length >= 3 && name.length <= 40 && !/\d{3,}|__[a-z0-9]{5,}/i.test(name)
    );
    if (stableClass) return `${element.tagName.toLowerCase()}.${escape(stableClass)}`;
    const parent = element.parentElement;
    if (!parent) return element.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter((item) => item.tagName === element.tagName);
    return `${stableSelector(parent)} > ${element.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(element) + 1})`;
  }
  function commonContainer(first, second) {
    const parents = /* @__PURE__ */ new Set();
    let current = first;
    while (current) {
      parents.add(current);
      current = current.parentElement;
    }
    current = second;
    while (current && !parents.has(current)) current = current.parentElement;
    return current?.closest("main, [role='main']") || current || document.body;
  }
  function profileId() {
    const host = location.hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    return `local-${host}`.slice(0, 64);
  }
  function startCalibration() {
    return new Promise((resolve) => {
      const host = document.createElement("div");
      host.dataset.aiChatCalibration = "";
      const shadow = host.attachShadow({ mode: "open" });
      let phase = "user";
      let user = null;
      let assistant = null;
      let title = null;
      const highlighted = /* @__PURE__ */ new Map();
      const copy = () => phase === "user" ? ["1 of 3", "Click one message written by you."] : phase === "assistant" ? ["2 of 3", "Click one response written by the assistant."] : ["3 of 3", "Click the conversation title, or skip this step."];
      const render = () => {
        const [step, instruction] = copy();
        shadow.innerHTML = `<style>${STYLE3}</style><div class="bar">
        <div class="copy"><span class="step">Calibration \xB7 ${step}</span><strong>${instruction}</strong></div>
        ${phase === "title" ? "<button data-skip>Skip title</button>" : ""}
        <button data-cancel>Cancel</button>
      </div>`;
        shadow.querySelector("[data-cancel]")?.addEventListener("click", () => finish(null));
        shadow.querySelector("[data-skip]")?.addEventListener("click", () => build());
      };
      const highlight = (element, color) => {
        if (!highlighted.has(element)) highlighted.set(element, element.getAttribute("style"));
        element.style.outline = `3px solid ${color}`;
        element.style.outlineOffset = "3px";
      };
      const finish = (profile2) => {
        document.removeEventListener("click", onClick, true);
        for (const [element, style] of highlighted) {
          if (style === null) element.removeAttribute("style");
          else element.setAttribute("style", style);
        }
        host.remove();
        resolve(profile2);
      };
      const build = () => {
        if (!user || !assistant) return;
        const userSelector = stableSelector(user);
        const assistantSelector = stableSelector(assistant);
        const container = commonContainer(user, assistant);
        const stamp = (/* @__PURE__ */ new Date()).toISOString();
        finish({
          schemaVersion: 1,
          id: profileId(),
          name: document.title.split(/[|\-–—]/)[0]?.trim() || location.hostname,
          source: "local",
          origins: [location.origin],
          pathPatterns: ["/*"],
          selectors: {
            conversation: container === document.body ? void 0 : stableSelector(container),
            messages: [.../* @__PURE__ */ new Set([userSelector, assistantSelector])],
            title: title ? stableSelector(title) : void 0,
            exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
          },
          roles: {
            strategy: "selectors",
            userSelectors: [userSelector],
            assistantSelectors: [assistantSelector],
            startsWith: "user"
          },
          confidence: 0.86,
          createdAt: stamp,
          updatedAt: stamp
        });
      };
      const onClick = (event) => {
        const target = event.target?.closest?.("article, div, section, h1, h2, h3");
        if (!target || target.closest("[data-ai-chat-overlay], [data-ai-chat-launcher]")) return;
        event.preventDefault();
        event.stopPropagation();
        if (phase === "user") {
          user = target;
          highlight(target, "#8ab4f8");
          phase = "assistant";
        } else if (phase === "assistant") {
          assistant = target;
          highlight(target, "#c0c0c0");
          phase = "title";
        } else {
          title = target;
          highlight(target, "#f4c57a");
          build();
          return;
        }
        render();
      };
      document.documentElement.append(host);
      document.addEventListener("click", onClick, true);
      render();
    });
  }

  // src/ui/toast.ts
  function showToast(message, tone = "info") {
    document.querySelector("[data-ai-chat-toast]")?.remove();
    const host = document.createElement("div");
    host.dataset.aiChatToast = "";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
    :host{all:initial}.toast{position:fixed;right:20px;bottom:82px;z-index:2147483647;
      max-width:360px;padding:11px 14px;border:1px solid ${tone === "error" ? "#9d5555" : "#4c6387"};
      border-radius:11px;color:#eef3fa;background:#141820;box-shadow:0 18px 50px #0009;
      font:13px/1.45 system-ui,sans-serif}
  </style><div class="toast" role="status"></div>`;
    shadow.querySelector(".toast").textContent = message;
    document.documentElement.append(host);
    setTimeout(() => host.remove(), 2600);
  }

  // src/entries/content.ts
  if (!window.__aiChatUtilitiesLoaded) {
    window.__aiChatUtilitiesLoaded = true;
    let adapter = genericAdapter;
    let currentSnapshot = null;
    const capture = async () => {
      adapter = await resolveAdapter(location.href);
      let draft = await adapter.extract(document);
      if (adapter.id.startsWith("profile:") && draft.messages.length < 2) {
        await markProfileForRepair(adapter.id.slice("profile:".length));
        adapter = genericAdapter;
        draft = await genericAdapter.extract(document);
        draft.warnings = [
          "The saved site profile no longer matches this page. Universal detection was used; recalibrate the site to repair it.",
          ...draft.warnings || []
        ];
      }
      document.querySelectorAll("[data-ai-chat-selected]").forEach((element) => {
        element.removeAttribute("data-ai-chat-selected");
        element.removeAttribute("data-ai-chat-role");
      });
      currentSnapshot = draft.messages.length ? normalizeSnapshot(adapter, draft, location.href) : null;
      return currentSnapshot;
    };
    const filenameFor = async (snapshot, extension) => {
      const { filenameTemplate = "{platform}-{title}" } = await chrome.storage.sync.get({
        filenameTemplate: "{platform}-{title}"
      });
      const value = String(filenameTemplate).replaceAll("{platform}", snapshot.platformName).replaceAll("{title}", snapshot.title).replaceAll("{date}", snapshot.capturedAt.slice(0, 10));
      return safeFilename(value, extension);
    };
    const act = async (action) => {
      try {
        if (action === "picker") {
          const profile2 = await startCalibration();
          if (profile2) {
            await saveLocalProfile(profile2);
            adapter = createProfileAdapter(profile2);
            showToast(`Saved a local profile for ${profile2.name}.`);
            await open(false);
          }
          return;
        }
        const snapshot = currentSnapshot || await capture();
        if (!snapshot) {
          showToast("No conversation messages were detected.", "error");
          return;
        }
        if (action === "markdown") {
          downloadText(await filenameFor(snapshot, "md"), snapshot.renderedMarkdown, "text/markdown");
          showToast("Markdown download started.");
        } else if (action === "copy") {
          await navigator.clipboard.writeText(snapshot.renderedMarkdown);
          showToast("Markdown copied.");
        } else if (action === "jupyter") {
          downloadText(await filenameFor(snapshot, "ipynb"), toJupyter(snapshot), "application/x-ipynb+json");
          showToast("Jupyter download started.");
        } else if (action === "archive") {
          const response = await chrome.runtime.sendMessage({ type: "ARCHIVE_SAVE", snapshot });
          if (!response?.ok) throw new Error(response?.error || "Archive save failed.");
          showToast("Conversation saved to the local archive.");
        } else if (action === "new-chat") {
          const target = adapter.getNewChatTarget?.(document);
          if (target) location.href = target;
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : "The requested action failed.", "error");
      }
    };
    const open = async (allowCalibration = true) => {
      await capture();
      const detection = adapter.detect(document);
      if (allowCalibration && adapter.id === "generic" && detection.confidence < 0.55) {
        const profile2 = await startCalibration();
        if (profile2) {
          await saveLocalProfile(profile2);
          adapter = createProfileAdapter(profile2);
          showToast(`Saved a local profile for ${profile2.name}.`);
          await open(false);
        }
        return;
      }
      showOverlay(adapter, currentSnapshot, act, detection);
    };
    const mountConfiguredLauncher = async () => {
      const { launcherEnabled = true, launcherPosition = "bottom-right" } = await chrome.storage.sync.get({
        launcherEnabled: true,
        launcherPosition: "bottom-right"
      });
      document.querySelector("[data-ai-chat-launcher]")?.remove();
      if (launcherEnabled) mountLauncher(open, launcherPosition);
    };
    void resolveAdapter(location.href).then((resolved) => {
      adapter = resolved;
      return mountConfiguredLauncher();
    });
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "SHOW_OVERLAY") {
        open().then(() => sendResponse({ ok: true }));
        return true;
      }
      if (message.type === "PING") sendResponse({ ok: true });
    });
    let lastUrl = location.href;
    const observer = new MutationObserver(async () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        adapter = await resolveAdapter(lastUrl);
        currentSnapshot = null;
        mountConfiguredLauncher();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
//# sourceMappingURL=content.js.map
