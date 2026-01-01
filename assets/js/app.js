// owl.carousel.js
// ScrollTrigger.min.js
// ScrollToPlugin.min.js
// lightbox.min.js
// main.js
// ajax-form.js
// color.js

/**
 * Owl Carousel v2.3.4
 * Copyright 2013-2018 David Deutsch
 * Licensed under: SEE LICENSE IN https://github.com/OwlCarousel2/OwlCarousel2/blob/master/LICENSE
 */
/**
 * Owl carousel
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 * @todo Lazy Load Icon
 * @todo prevent animationend bubling
 * @todo itemsScaleUp
 * @todo Test Zepto
 * @todo stagePadding calculate wrong active classes
 */
; (function ($, window, document, undefined) {

    /**
     * Creates a carousel.
     * @class The Owl Carousel.
     * @public
     * @param {HTMLElement|jQuery} element - The element to create the carousel for.
     * @param {Object} [options] - The options
     */
    function Owl(element, options) {

        /**
         * Current settings for the carousel.
         * @public
         */
        this.settings = null;

        /**
         * Current options set by the caller including defaults.
         * @public
         */
        this.options = $.extend({}, Owl.Defaults, options);

        /**
         * Plugin element.
         * @public
         */
        this.$element = $(element);

        /**
         * Proxied event handlers.
         * @protected
         */
        this._handlers = {};

        /**
         * References to the running plugins of this carousel.
         * @protected
         */
        this._plugins = {};

        /**
         * Currently suppressed events to prevent them from being retriggered.
         * @protected
         */
        this._supress = {};

        /**
         * Absolute current position.
         * @protected
         */
        this._current = null;

        /**
         * Animation speed in milliseconds.
         * @protected
         */
        this._speed = null;

        /**
         * Coordinates of all items in pixel.
         * @todo The name of this member is missleading.
         * @protected
         */
        this._coordinates = [];

        /**
         * Current breakpoint.
         * @todo Real media queries would be nice.
         * @protected
         */
        this._breakpoint = null;

        /**
         * Current width of the plugin element.
         */
        this._width = null;

        /**
         * All real items.
         * @protected
         */
        this._items = [];

        /**
         * All cloned items.
         * @protected
         */
        this._clones = [];

        /**
         * Merge values of all items.
         * @todo Maybe this could be part of a plugin.
         * @protected
         */
        this._mergers = [];

        /**
         * Widths of all items.
         */
        this._widths = [];

        /**
         * Invalidated parts within the update process.
         * @protected
         */
        this._invalidated = {};

        /**
         * Ordered list of workers for the update process.
         * @protected
         */
        this._pipe = [];

        /**
         * Current state information for the drag operation.
         * @todo #261
         * @protected
         */
        this._drag = {
            time: null,
            target: null,
            pointer: null,
            stage: {
                start: null,
                current: null
            },
            direction: null
        };

        /**
         * Current state information and their tags.
         * @type {Object}
         * @protected
         */
        this._states = {
            current: {},
            tags: {
                'initializing': ['busy'],
                'animating': ['busy'],
                'dragging': ['interacting']
            }
        };

        $.each(['onResize', 'onThrottledResize'], $.proxy(function (i, handler) {
            this._handlers[handler] = $.proxy(this[handler], this);
        }, this));

        $.each(Owl.Plugins, $.proxy(function (key, plugin) {
            this._plugins[key.charAt(0).toLowerCase() + key.slice(1)]
                = new plugin(this);
        }, this));

        $.each(Owl.Workers, $.proxy(function (priority, worker) {
            this._pipe.push({
                'filter': worker.filter,
                'run': $.proxy(worker.run, this)
            });
        }, this));

        this.setup();
        this.initialize();
    }

    /**
     * Default options for the carousel.
     * @public
     */
    Owl.Defaults = {
        items: 3,
        loop: false,
        center: false,
        rewind: false,
        checkVisibility: true,

        mouseDrag: true,
        touchDrag: true,
        pullDrag: true,
        freeDrag: false,

        margin: 0,
        stagePadding: 0,

        merge: false,
        mergeFit: true,
        autoWidth: false,

        startPosition: 0,
        rtl: false,

        smartSpeed: 250,
        fluidSpeed: false,
        dragEndSpeed: false,

        responsive: {},
        responsiveRefreshRate: 200,
        responsiveBaseElement: window,

        fallbackEasing: 'swing',
        slideTransition: '',

        info: false,

        nestedItemSelector: false,
        itemElement: 'div',
        stageElement: 'div',

        refreshClass: 'owl-refresh',
        loadedClass: 'owl-loaded',
        loadingClass: 'owl-loading',
        rtlClass: 'owl-rtl',
        responsiveClass: 'owl-responsive',
        dragClass: 'owl-drag',
        itemClass: 'owl-item',
        stageClass: 'owl-stage',
        stageOuterClass: 'owl-stage-outer',
        grabClass: 'owl-grab'
    };

    /**
     * Enumeration for width.
     * @public
     * @readonly
     * @enum {String}
     */
    Owl.Width = {
        Default: 'default',
        Inner: 'inner',
        Outer: 'outer'
    };

    /**
     * Enumeration for types.
     * @public
     * @readonly
     * @enum {String}
     */
    Owl.Type = {
        Event: 'event',
        State: 'state'
    };

    /**
     * Contains all registered plugins.
     * @public
     */
    Owl.Plugins = {};

    /**
     * List of workers involved in the update process.
     */
    Owl.Workers = [{
        filter: ['width', 'settings'],
        run: function () {
            this._width = this.$element.width();
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function (cache) {
            cache.current = this._items && this._items[this.relative(this._current)];
        }
    }, {
        filter: ['items', 'settings'],
        run: function () {
            this.$stage.children('.cloned').remove();
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function (cache) {
            var margin = this.settings.margin || '',
                grid = !this.settings.autoWidth,
                rtl = this.settings.rtl,
                css = {
                    'width': 'auto',
                    'margin-left': rtl ? margin : '',
                    'margin-right': rtl ? '' : margin
                };

            !grid && this.$stage.children().css(css);

            cache.css = css;
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function (cache) {
            var width = (this.width() / this.settings.items).toFixed(3) - this.settings.margin,
                merge = null,
                iterator = this._items.length,
                grid = !this.settings.autoWidth,
                widths = [];

            cache.items = {
                merge: false,
                width: width
            };

            while (iterator--) {
                merge = this._mergers[iterator];
                merge = this.settings.mergeFit && Math.min(merge, this.settings.items) || merge;

                cache.items.merge = merge > 1 || cache.items.merge;

                widths[iterator] = !grid ? this._items[iterator].width() : width * merge;
            }

            this._widths = widths;
        }
    }, {
        filter: ['items', 'settings'],
        run: function () {
            var clones = [],
                items = this._items,
                settings = this.settings,
                // TODO: Should be computed from number of min width items in stage
                view = Math.max(settings.items * 2, 4),
                size = Math.ceil(items.length / 2) * 2,
                repeat = settings.loop && items.length ? settings.rewind ? view : Math.max(view, size) : 0,
                append = '',
                prepend = '';

            repeat /= 2;

            while (repeat > 0) {
                // Switch to only using appended clones
                clones.push(this.normalize(clones.length / 2, true));
                append = append + items[clones[clones.length - 1]][0].outerHTML;
                clones.push(this.normalize(items.length - 1 - (clones.length - 1) / 2, true));
                prepend = items[clones[clones.length - 1]][0].outerHTML + prepend;
                repeat -= 1;
            }

            this._clones = clones;

            $(append).addClass('cloned').appendTo(this.$stage);
            $(prepend).addClass('cloned').prependTo(this.$stage);
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function () {
            var rtl = this.settings.rtl ? 1 : -1,
                size = this._clones.length + this._items.length,
                iterator = -1,
                previous = 0,
                current = 0,
                coordinates = [];

            while (++iterator < size) {
                previous = coordinates[iterator - 1] || 0;
                current = this._widths[this.relative(iterator)] + this.settings.margin;
                coordinates.push(previous + current * rtl);
            }

            this._coordinates = coordinates;
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function () {
            var padding = this.settings.stagePadding,
                coordinates = this._coordinates,
                css = {
                    'width': Math.ceil(Math.abs(coordinates[coordinates.length - 1])) + padding * 2,
                    'padding-left': padding || '',
                    'padding-right': padding || ''
                };

            this.$stage.css(css);
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function (cache) {
            var iterator = this._coordinates.length,
                grid = !this.settings.autoWidth,
                items = this.$stage.children();

            if (grid && cache.items.merge) {
                while (iterator--) {
                    cache.css.width = this._widths[this.relative(iterator)];
                    items.eq(iterator).css(cache.css);
                }
            } else if (grid) {
                cache.css.width = cache.items.width;
                items.css(cache.css);
            }
        }
    }, {
        filter: ['items'],
        run: function () {
            this._coordinates.length < 1 && this.$stage.removeAttr('style');
        }
    }, {
        filter: ['width', 'items', 'settings'],
        run: function (cache) {
            cache.current = cache.current ? this.$stage.children().index(cache.current) : 0;
            cache.current = Math.max(this.minimum(), Math.min(this.maximum(), cache.current));
            this.reset(cache.current);
        }
    }, {
        filter: ['position'],
        run: function () {
            this.animate(this.coordinates(this._current));
        }
    }, {
        filter: ['width', 'position', 'items', 'settings'],
        run: function () {
            var rtl = this.settings.rtl ? 1 : -1,
                padding = this.settings.stagePadding * 2,
                begin = this.coordinates(this.current()) + padding,
                end = begin + this.width() * rtl,
                inner, outer, matches = [], i, n;

            for (i = 0, n = this._coordinates.length; i < n; i++) {
                inner = this._coordinates[i - 1] || 0;
                outer = Math.abs(this._coordinates[i]) + padding * rtl;

                if ((this.op(inner, '<=', begin) && (this.op(inner, '>', end)))
                    || (this.op(outer, '<', begin) && this.op(outer, '>', end))) {
                    matches.push(i);
                }
            }

            this.$stage.children('.active').removeClass('active');
            this.$stage.children(':eq(' + matches.join('), :eq(') + ')').addClass('active');

            this.$stage.children('.center').removeClass('center');
            if (this.settings.center) {
                this.$stage.children().eq(this.current()).addClass('center');
            }
        }
    }];

    /**
     * Create the stage DOM element
     */
    Owl.prototype.initializeStage = function () {
        this.$stage = this.$element.find('.' + this.settings.stageClass);

        // if the stage is already in the DOM, grab it and skip stage initialization
        if (this.$stage.length) {
            return;
        }

        this.$element.addClass(this.options.loadingClass);

        // create stage
        this.$stage = $('<' + this.settings.stageElement + '>', {
            "class": this.settings.stageClass
        }).wrap($('<div/>', {
            "class": this.settings.stageOuterClass
        }));

        // append stage
        this.$element.append(this.$stage.parent());
    };

    /**
     * Create item DOM elements
     */
    Owl.prototype.initializeItems = function () {
        var $items = this.$element.find('.owl-item');

        // if the items are already in the DOM, grab them and skip item initialization
        if ($items.length) {
            this._items = $items.get().map(function (item) {
                return $(item);
            });

            this._mergers = this._items.map(function () {
                return 1;
            });

            this.refresh();

            return;
        }

        // append content
        this.replace(this.$element.children().not(this.$stage.parent()));

        // check visibility
        if (this.isVisible()) {
            // update view
            this.refresh();
        } else {
            // invalidate width
            this.invalidate('width');
        }

        this.$element
            .removeClass(this.options.loadingClass)
            .addClass(this.options.loadedClass);
    };

    /**
     * Initializes the carousel.
     * @protected
     */
    Owl.prototype.initialize = function () {
        this.enter('initializing');
        this.trigger('initialize');

        this.$element.toggleClass(this.settings.rtlClass, this.settings.rtl);

        if (this.settings.autoWidth && !this.is('pre-loading')) {
            var imgs, nestedSelector, width;
            imgs = this.$element.find('img');
            nestedSelector = this.settings.nestedItemSelector ? '.' + this.settings.nestedItemSelector : undefined;
            width = this.$element.children(nestedSelector).width();

            if (imgs.length && width <= 0) {
                this.preloadAutoWidthImages(imgs);
            }
        }

        this.initializeStage();
        this.initializeItems();

        // register event handlers
        this.registerEventHandlers();

        this.leave('initializing');
        this.trigger('initialized');
    };

    /**
     * @returns {Boolean} visibility of $element
     *                    if you know the carousel will always be visible you can set `checkVisibility` to `false` to
     *                    prevent the expensive browser layout forced reflow the $element.is(':visible') does
     */
    Owl.prototype.isVisible = function () {
        return this.settings.checkVisibility
            ? this.$element.is(':visible')
            : true;
    };

    /**
     * Setups the current settings.
     * @todo Remove responsive classes. Why should adaptive designs be brought into IE8?
     * @todo Support for media queries by using `matchMedia` would be nice.
     * @public
     */
    Owl.prototype.setup = function () {
        var viewport = this.viewport(),
            overwrites = this.options.responsive,
            match = -1,
            settings = null;

        if (!overwrites) {
            settings = $.extend({}, this.options);
        } else {
            $.each(overwrites, function (breakpoint) {
                if (breakpoint <= viewport && breakpoint > match) {
                    match = Number(breakpoint);
                }
            });

            settings = $.extend({}, this.options, overwrites[match]);
            if (typeof settings.stagePadding === 'function') {
                settings.stagePadding = settings.stagePadding();
            }
            delete settings.responsive;

            // responsive class
            if (settings.responsiveClass) {
                this.$element.attr('class',
                    this.$element.attr('class').replace(new RegExp('(' + this.options.responsiveClass + '-)\\S+\\s', 'g'), '$1' + match)
                );
            }
        }

        this.trigger('change', { property: { name: 'settings', value: settings } });
        this._breakpoint = match;
        this.settings = settings;
        this.invalidate('settings');
        this.trigger('changed', { property: { name: 'settings', value: this.settings } });
    };

    /**
     * Updates option logic if necessery.
     * @protected
     */
    Owl.prototype.optionsLogic = function () {
        if (this.settings.autoWidth) {
            this.settings.stagePadding = false;
            this.settings.merge = false;
        }
    };

    /**
     * Prepares an item before add.
     * @todo Rename event parameter `content` to `item`.
     * @protected
     * @returns {jQuery|HTMLElement} - The item container.
     */
    Owl.prototype.prepare = function (item) {
        var event = this.trigger('prepare', { content: item });

        if (!event.data) {
            event.data = $('<' + this.settings.itemElement + '/>')
                .addClass(this.options.itemClass).append(item)
        }

        this.trigger('prepared', { content: event.data });

        return event.data;
    };

    /**
     * Updates the view.
     * @public
     */
    Owl.prototype.update = function () {
        var i = 0,
            n = this._pipe.length,
            filter = $.proxy(function (p) { return this[p] }, this._invalidated),
            cache = {};

        while (i < n) {
            if (this._invalidated.all || $.grep(this._pipe[i].filter, filter).length > 0) {
                this._pipe[i].run(cache);
            }
            i++;
        }

        this._invalidated = {};

        !this.is('valid') && this.enter('valid');
    };

    /**
     * Gets the width of the view.
     * @public
     * @param {Owl.Width} [dimension=Owl.Width.Default] - The dimension to return.
     * @returns {Number} - The width of the view in pixel.
     */
    Owl.prototype.width = function (dimension) {
        dimension = dimension || Owl.Width.Default;
        switch (dimension) {
            case Owl.Width.Inner:
            case Owl.Width.Outer:
                return this._width;
            default:
                return this._width - this.settings.stagePadding * 2 + this.settings.margin;
        }
    };

    /**
     * Refreshes the carousel primarily for adaptive purposes.
     * @public
     */
    Owl.prototype.refresh = function () {
        this.enter('refreshing');
        this.trigger('refresh');

        this.setup();

        this.optionsLogic();

        this.$element.addClass(this.options.refreshClass);

        this.update();

        this.$element.removeClass(this.options.refreshClass);

        this.leave('refreshing');
        this.trigger('refreshed');
    };

    /**
     * Checks window `resize` event.
     * @protected
     */
    Owl.prototype.onThrottledResize = function () {
        window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(this._handlers.onResize, this.settings.responsiveRefreshRate);
    };

    /**
     * Checks window `resize` event.
     * @protected
     */
    Owl.prototype.onResize = function () {
        if (!this._items.length) {
            return false;
        }

        if (this._width === this.$element.width()) {
            return false;
        }

        if (!this.isVisible()) {
            return false;
        }

        this.enter('resizing');

        if (this.trigger('resize').isDefaultPrevented()) {
            this.leave('resizing');
            return false;
        }

        this.invalidate('width');

        this.refresh();

        this.leave('resizing');
        this.trigger('resized');
    };

    /**
     * Registers event handlers.
     * @todo Check `msPointerEnabled`
     * @todo #261
     * @protected
     */
    Owl.prototype.registerEventHandlers = function () {
        if ($.support.transition) {
            this.$stage.on($.support.transition.end + '.owl.core', $.proxy(this.onTransitionEnd, this));
        }

        if (this.settings.responsive !== false) {
            this.on(window, 'resize', this._handlers.onThrottledResize);
        }

        if (this.settings.mouseDrag) {
            this.$element.addClass(this.options.dragClass);
            this.$stage.on('mousedown.owl.core', $.proxy(this.onDragStart, this));
            this.$stage.on('dragstart.owl.core selectstart.owl.core', function () { return false });
        }

        if (this.settings.touchDrag) {
            this.$stage.on('touchstart.owl.core', $.proxy(this.onDragStart, this));
            this.$stage.on('touchcancel.owl.core', $.proxy(this.onDragEnd, this));
        }
    };

    /**
     * Handles `touchstart` and `mousedown` events.
     * @todo Horizontal swipe threshold as option
     * @todo #261
     * @protected
     * @param {Event} event - The event arguments.
     */
    Owl.prototype.onDragStart = function (event) {
        var stage = null;

        if (event.which === 3) {
            return;
        }

        if ($.support.transform) {
            stage = this.$stage.css('transform').replace(/.*\(|\)| /g, '').split(',');
            stage = {
                x: stage[stage.length === 16 ? 12 : 4],
                y: stage[stage.length === 16 ? 13 : 5]
            };
        } else {
            stage = this.$stage.position();
            stage = {
                x: this.settings.rtl ?
                    stage.left + this.$stage.width() - this.width() + this.settings.margin :
                    stage.left,
                y: stage.top
            };
        }

        if (this.is('animating')) {
            $.support.transform ? this.animate(stage.x) : this.$stage.stop()
            this.invalidate('position');
        }

        this.$element.toggleClass(this.options.grabClass, event.type === 'mousedown');

        this.speed(0);

        this._drag.time = new Date().getTime();
        this._drag.target = $(event.target);
        this._drag.stage.start = stage;
        this._drag.stage.current = stage;
        this._drag.pointer = this.pointer(event);

        $(document).on('mouseup.owl.core touchend.owl.core', $.proxy(this.onDragEnd, this));

        $(document).one('mousemove.owl.core touchmove.owl.core', $.proxy(function (event) {
            var delta = this.difference(this._drag.pointer, this.pointer(event));

            $(document).on('mousemove.owl.core touchmove.owl.core', $.proxy(this.onDragMove, this));

            if (Math.abs(delta.x) < Math.abs(delta.y) && this.is('valid')) {
                return;
            }

            event.preventDefault();

            this.enter('dragging');
            this.trigger('drag');
        }, this));
    };

    /**
     * Handles the `touchmove` and `mousemove` events.
     * @todo #261
     * @protected
     * @param {Event} event - The event arguments.
     */
    Owl.prototype.onDragMove = function (event) {
        var minimum = null,
            maximum = null,
            pull = null,
            delta = this.difference(this._drag.pointer, this.pointer(event)),
            stage = this.difference(this._drag.stage.start, delta);

        if (!this.is('dragging')) {
            return;
        }

        event.preventDefault();

        if (this.settings.loop) {
            minimum = this.coordinates(this.minimum());
            maximum = this.coordinates(this.maximum() + 1) - minimum;
            stage.x = (((stage.x - minimum) % maximum + maximum) % maximum) + minimum;
        } else {
            minimum = this.settings.rtl ? this.coordinates(this.maximum()) : this.coordinates(this.minimum());
            maximum = this.settings.rtl ? this.coordinates(this.minimum()) : this.coordinates(this.maximum());
            pull = this.settings.pullDrag ? -1 * delta.x / 5 : 0;
            stage.x = Math.max(Math.min(stage.x, minimum + pull), maximum + pull);
        }

        this._drag.stage.current = stage;

        this.animate(stage.x);
    };

    /**
     * Handles the `touchend` and `mouseup` events.
     * @todo #261
     * @todo Threshold for click event
     * @protected
     * @param {Event} event - The event arguments.
     */
    Owl.prototype.onDragEnd = function (event) {
        var delta = this.difference(this._drag.pointer, this.pointer(event)),
            stage = this._drag.stage.current,
            direction = delta.x > 0 ^ this.settings.rtl ? 'left' : 'right';

        $(document).off('.owl.core');

        this.$element.removeClass(this.options.grabClass);

        if (delta.x !== 0 && this.is('dragging') || !this.is('valid')) {
            this.speed(this.settings.dragEndSpeed || this.settings.smartSpeed);
            this.current(this.closest(stage.x, delta.x !== 0 ? direction : this._drag.direction));
            this.invalidate('position');
            this.update();

            this._drag.direction = direction;

            if (Math.abs(delta.x) > 3 || new Date().getTime() - this._drag.time > 300) {
                this._drag.target.one('click.owl.core', function () { return false; });
            }
        }

        if (!this.is('dragging')) {
            return;
        }

        this.leave('dragging');
        this.trigger('dragged');
    };

    /**
     * Gets absolute position of the closest item for a coordinate.
     * @todo Setting `freeDrag` makes `closest` not reusable. See #165.
     * @protected
     * @param {Number} coordinate - The coordinate in pixel.
     * @param {String} direction - The direction to check for the closest item. Ether `left` or `right`.
     * @return {Number} - The absolute position of the closest item.
     */
    Owl.prototype.closest = function (coordinate, direction) {
        var position = -1,
            pull = 30,
            width = this.width(),
            coordinates = this.coordinates();

        if (!this.settings.freeDrag) {
            // check closest item
            $.each(coordinates, $.proxy(function (index, value) {
                // on a left pull, check on current index
                if (direction === 'left' && coordinate > value - pull && coordinate < value + pull) {
                    position = index;
                    // on a right pull, check on previous index
                    // to do so, subtract width from value and set position = index + 1
                } else if (direction === 'right' && coordinate > value - width - pull && coordinate < value - width + pull) {
                    position = index + 1;
                } else if (this.op(coordinate, '<', value)
                    && this.op(coordinate, '>', coordinates[index + 1] !== undefined ? coordinates[index + 1] : value - width)) {
                    position = direction === 'left' ? index + 1 : index;
                }
                return position === -1;
            }, this));
        }

        if (!this.settings.loop) {
            // non loop boundries
            if (this.op(coordinate, '>', coordinates[this.minimum()])) {
                position = coordinate = this.minimum();
            } else if (this.op(coordinate, '<', coordinates[this.maximum()])) {
                position = coordinate = this.maximum();
            }
        }

        return position;
    };

    /**
     * Animates the stage.
     * @todo #270
     * @public
     * @param {Number} coordinate - The coordinate in pixels.
     */
    Owl.prototype.animate = function (coordinate) {
        var animate = this.speed() > 0;

        this.is('animating') && this.onTransitionEnd();

        if (animate) {
            this.enter('animating');
            this.trigger('translate');
        }

        if ($.support.transform3d && $.support.transition) {
            this.$stage.css({
                transform: 'translate3d(' + coordinate + 'px,0px,0px)',
                transition: (this.speed() / 1000) + 's' + (
                    this.settings.slideTransition ? ' ' + this.settings.slideTransition : ''
                )
            });
        } else if (animate) {
            this.$stage.animate({
                left: coordinate + 'px'
            }, this.speed(), this.settings.fallbackEasing, $.proxy(this.onTransitionEnd, this));
        } else {
            this.$stage.css({
                left: coordinate + 'px'
            });
        }
    };

    /**
     * Checks whether the carousel is in a specific state or not.
     * @param {String} state - The state to check.
     * @returns {Boolean} - The flag which indicates if the carousel is busy.
     */
    Owl.prototype.is = function (state) {
        return this._states.current[state] && this._states.current[state] > 0;
    };

    /**
     * Sets the absolute position of the current item.
     * @public
     * @param {Number} [position] - The new absolute position or nothing to leave it unchanged.
     * @returns {Number} - The absolute position of the current item.
     */
    Owl.prototype.current = function (position) {
        if (position === undefined) {
            return this._current;
        }

        if (this._items.length === 0) {
            return undefined;
        }

        position = this.normalize(position);

        if (this._current !== position) {
            var event = this.trigger('change', { property: { name: 'position', value: position } });

            if (event.data !== undefined) {
                position = this.normalize(event.data);
            }

            this._current = position;

            this.invalidate('position');

            this.trigger('changed', { property: { name: 'position', value: this._current } });
        }

        return this._current;
    };

    /**
     * Invalidates the given part of the update routine.
     * @param {String} [part] - The part to invalidate.
     * @returns {Array.<String>} - The invalidated parts.
     */
    Owl.prototype.invalidate = function (part) {
        if ($.type(part) === 'string') {
            this._invalidated[part] = true;
            this.is('valid') && this.leave('valid');
        }
        return $.map(this._invalidated, function (v, i) { return i });
    };

    /**
     * Resets the absolute position of the current item.
     * @public
     * @param {Number} position - The absolute position of the new item.
     */
    Owl.prototype.reset = function (position) {
        position = this.normalize(position);

        if (position === undefined) {
            return;
        }

        this._speed = 0;
        this._current = position;

        this.suppress(['translate', 'translated']);

        this.animate(this.coordinates(position));

        this.release(['translate', 'translated']);
    };

    /**
     * Normalizes an absolute or a relative position of an item.
     * @public
     * @param {Number} position - The absolute or relative position to normalize.
     * @param {Boolean} [relative=false] - Whether the given position is relative or not.
     * @returns {Number} - The normalized position.
     */
    Owl.prototype.normalize = function (position, relative) {
        var n = this._items.length,
            m = relative ? 0 : this._clones.length;

        if (!this.isNumeric(position) || n < 1) {
            position = undefined;
        } else if (position < 0 || position >= n + m) {
            position = ((position - m / 2) % n + n) % n + m / 2;
        }

        return position;
    };

    /**
     * Converts an absolute position of an item into a relative one.
     * @public
     * @param {Number} position - The absolute position to convert.
     * @returns {Number} - The converted position.
     */
    Owl.prototype.relative = function (position) {
        position -= this._clones.length / 2;
        return this.normalize(position, true);
    };

    /**
     * Gets the maximum position for the current item.
     * @public
     * @param {Boolean} [relative=false] - Whether to return an absolute position or a relative position.
     * @returns {Number}
     */
    Owl.prototype.maximum = function (relative) {
        var settings = this.settings,
            maximum = this._coordinates.length,
            iterator,
            reciprocalItemsWidth,
            elementWidth;

        if (settings.loop) {
            maximum = this._clones.length / 2 + this._items.length - 1;
        } else if (settings.autoWidth || settings.merge) {
            iterator = this._items.length;
            if (iterator) {
                reciprocalItemsWidth = this._items[--iterator].width();
                elementWidth = this.$element.width();
                while (iterator--) {
                    reciprocalItemsWidth += this._items[iterator].width() + this.settings.margin;
                    if (reciprocalItemsWidth > elementWidth) {
                        break;
                    }
                }
            }
            maximum = iterator + 1;
        } else if (settings.center) {
            maximum = this._items.length - 1;
        } else {
            maximum = this._items.length - settings.items;
        }

        if (relative) {
            maximum -= this._clones.length / 2;
        }

        return Math.max(maximum, 0);
    };

    /**
     * Gets the minimum position for the current item.
     * @public
     * @param {Boolean} [relative=false] - Whether to return an absolute position or a relative position.
     * @returns {Number}
     */
    Owl.prototype.minimum = function (relative) {
        return relative ? 0 : this._clones.length / 2;
    };

    /**
     * Gets an item at the specified relative position.
     * @public
     * @param {Number} [position] - The relative position of the item.
     * @return {jQuery|Array.<jQuery>} - The item at the given position or all items if no position was given.
     */
    Owl.prototype.items = function (position) {
        if (position === undefined) {
            return this._items.slice();
        }

        position = this.normalize(position, true);
        return this._items[position];
    };

    /**
     * Gets an item at the specified relative position.
     * @public
     * @param {Number} [position] - The relative position of the item.
     * @return {jQuery|Array.<jQuery>} - The item at the given position or all items if no position was given.
     */
    Owl.prototype.mergers = function (position) {
        if (position === undefined) {
            return this._mergers.slice();
        }

        position = this.normalize(position, true);
        return this._mergers[position];
    };

    /**
     * Gets the absolute positions of clones for an item.
     * @public
     * @param {Number} [position] - The relative position of the item.
     * @returns {Array.<Number>} - The absolute positions of clones for the item or all if no position was given.
     */
    Owl.prototype.clones = function (position) {
        var odd = this._clones.length / 2,
            even = odd + this._items.length,
            map = function (index) { return index % 2 === 0 ? even + index / 2 : odd - (index + 1) / 2 };

        if (position === undefined) {
            return $.map(this._clones, function (v, i) { return map(i) });
        }

        return $.map(this._clones, function (v, i) { return v === position ? map(i) : null });
    };

    /**
     * Sets the current animation speed.
     * @public
     * @param {Number} [speed] - The animation speed in milliseconds or nothing to leave it unchanged.
     * @returns {Number} - The current animation speed in milliseconds.
     */
    Owl.prototype.speed = function (speed) {
        if (speed !== undefined) {
            this._speed = speed;
        }

        return this._speed;
    };

    /**
     * Gets the coordinate of an item.
     * @todo The name of this method is missleanding.
     * @public
     * @param {Number} position - The absolute position of the item within `minimum()` and `maximum()`.
     * @returns {Number|Array.<Number>} - The coordinate of the item in pixel or all coordinates.
     */
    Owl.prototype.coordinates = function (position) {
        var multiplier = 1,
            newPosition = position - 1,
            coordinate;

        if (position === undefined) {
            return $.map(this._coordinates, $.proxy(function (coordinate, index) {
                return this.coordinates(index);
            }, this));
        }

        if (this.settings.center) {
            if (this.settings.rtl) {
                multiplier = -1;
                newPosition = position + 1;
            }

            coordinate = this._coordinates[position];
            coordinate += (this.width() - coordinate + (this._coordinates[newPosition] || 0)) / 2 * multiplier;
        } else {
            coordinate = this._coordinates[newPosition] || 0;
        }

        coordinate = Math.ceil(coordinate);

        return coordinate;
    };

    /**
     * Calculates the speed for a translation.
     * @protected
     * @param {Number} from - The absolute position of the start item.
     * @param {Number} to - The absolute position of the target item.
     * @param {Number} [factor=undefined] - The time factor in milliseconds.
     * @returns {Number} - The time in milliseconds for the translation.
     */
    Owl.prototype.duration = function (from, to, factor) {
        if (factor === 0) {
            return 0;
        }

        return Math.min(Math.max(Math.abs(to - from), 1), 6) * Math.abs((factor || this.settings.smartSpeed));
    };

    /**
     * Slides to the specified item.
     * @public
     * @param {Number} position - The position of the item.
     * @param {Number} [speed] - The time in milliseconds for the transition.
     */
    Owl.prototype.to = function (position, speed) {
        var current = this.current(),
            revert = null,
            distance = position - this.relative(current),
            direction = (distance > 0) - (distance < 0),
            items = this._items.length,
            minimum = this.minimum(),
            maximum = this.maximum();

        if (this.settings.loop) {
            if (!this.settings.rewind && Math.abs(distance) > items / 2) {
                distance += direction * -1 * items;
            }

            position = current + distance;
            revert = ((position - minimum) % items + items) % items + minimum;

            if (revert !== position && revert - distance <= maximum && revert - distance > 0) {
                current = revert - distance;
                position = revert;
                this.reset(current);
            }
        } else if (this.settings.rewind) {
            maximum += 1;
            position = (position % maximum + maximum) % maximum;
        } else {
            position = Math.max(minimum, Math.min(maximum, position));
        }

        this.speed(this.duration(current, position, speed));
        this.current(position);

        if (this.isVisible()) {
            this.update();
        }
    };

    /**
     * Slides to the next item.
     * @public
     * @param {Number} [speed] - The time in milliseconds for the transition.
     */
    Owl.prototype.next = function (speed) {
        speed = speed || false;
        this.to(this.relative(this.current()) + 1, speed);
    };

    /**
     * Slides to the previous item.
     * @public
     * @param {Number} [speed] - The time in milliseconds for the transition.
     */
    Owl.prototype.prev = function (speed) {
        speed = speed || false;
        this.to(this.relative(this.current()) - 1, speed);
    };

    /**
     * Handles the end of an animation.
     * @protected
     * @param {Event} event - The event arguments.
     */
    Owl.prototype.onTransitionEnd = function (event) {

        // if css2 animation then event object is undefined
        if (event !== undefined) {
            event.stopPropagation();

            // Catch only owl-stage transitionEnd event
            if ((event.target || event.srcElement || event.originalTarget) !== this.$stage.get(0)) {
                return false;
            }
        }

        this.leave('animating');
        this.trigger('translated');
    };

    /**
     * Gets viewport width.
     * @protected
     * @return {Number} - The width in pixel.
     */
    Owl.prototype.viewport = function () {
        var width;
        if (this.options.responsiveBaseElement !== window) {
            width = $(this.options.responsiveBaseElement).width();
        } else if (window.innerWidth) {
            width = window.innerWidth;
        } else if (document.documentElement && document.documentElement.clientWidth) {
            width = document.documentElement.clientWidth;
        } else {
            console.warn('Can not detect viewport width.');
        }
        return width;
    };

    /**
     * Replaces the current content.
     * @public
     * @param {HTMLElement|jQuery|String} content - The new content.
     */
    Owl.prototype.replace = function (content) {
        this.$stage.empty();
        this._items = [];

        if (content) {
            content = (content instanceof jQuery) ? content : $(content);
        }

        if (this.settings.nestedItemSelector) {
            content = content.find('.' + this.settings.nestedItemSelector);
        }

        content.filter(function () {
            return this.nodeType === 1;
        }).each($.proxy(function (index, item) {
            item = this.prepare(item);
            this.$stage.append(item);
            this._items.push(item);
            this._mergers.push(item.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        }, this));

        this.reset(this.isNumeric(this.settings.startPosition) ? this.settings.startPosition : 0);

        this.invalidate('items');
    };

    /**
     * Adds an item.
     * @todo Use `item` instead of `content` for the event arguments.
     * @public
     * @param {HTMLElement|jQuery|String} content - The item content to add.
     * @param {Number} [position] - The relative position at which to insert the item otherwise the item will be added to the end.
     */
    Owl.prototype.add = function (content, position) {
        var current = this.relative(this._current);

        position = position === undefined ? this._items.length : this.normalize(position, true);
        content = content instanceof jQuery ? content : $(content);

        this.trigger('add', { content: content, position: position });

        content = this.prepare(content);

        if (this._items.length === 0 || position === this._items.length) {
            this._items.length === 0 && this.$stage.append(content);
            this._items.length !== 0 && this._items[position - 1].after(content);
            this._items.push(content);
            this._mergers.push(content.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        } else {
            this._items[position].before(content);
            this._items.splice(position, 0, content);
            this._mergers.splice(position, 0, content.find('[data-merge]').addBack('[data-merge]').attr('data-merge') * 1 || 1);
        }

        this._items[current] && this.reset(this._items[current].index());

        this.invalidate('items');

        this.trigger('added', { content: content, position: position });
    };

    /**
     * Removes an item by its position.
     * @todo Use `item` instead of `content` for the event arguments.
     * @public
     * @param {Number} position - The relative position of the item to remove.
     */
    Owl.prototype.remove = function (position) {
        position = this.normalize(position, true);

        if (position === undefined) {
            return;
        }

        this.trigger('remove', { content: this._items[position], position: position });

        this._items[position].remove();
        this._items.splice(position, 1);
        this._mergers.splice(position, 1);

        this.invalidate('items');

        this.trigger('removed', { content: null, position: position });
    };

    /**
     * Preloads images with auto width.
     * @todo Replace by a more generic approach
     * @protected
     */
    Owl.prototype.preloadAutoWidthImages = function (images) {
        images.each($.proxy(function (i, element) {
            this.enter('pre-loading');
            element = $(element);
            $(new Image()).one('load', $.proxy(function (e) {
                element.attr('src', e.target.src);
                element.css('opacity', 1);
                this.leave('pre-loading');
                !this.is('pre-loading') && !this.is('initializing') && this.refresh();
            }, this)).attr('src', element.attr('src') || element.attr('data-src') || element.attr('data-src-retina'));
        }, this));
    };

    /**
     * Destroys the carousel.
     * @public
     */
    Owl.prototype.destroy = function () {

        this.$element.off('.owl.core');
        this.$stage.off('.owl.core');
        $(document).off('.owl.core');

        if (this.settings.responsive !== false) {
            window.clearTimeout(this.resizeTimer);
            this.off(window, 'resize', this._handlers.onThrottledResize);
        }

        for (var i in this._plugins) {
            this._plugins[i].destroy();
        }

        this.$stage.children('.cloned').remove();

        this.$stage.unwrap();
        this.$stage.children().contents().unwrap();
        this.$stage.children().unwrap();
        this.$stage.remove();
        this.$element
            .removeClass(this.options.refreshClass)
            .removeClass(this.options.loadingClass)
            .removeClass(this.options.loadedClass)
            .removeClass(this.options.rtlClass)
            .removeClass(this.options.dragClass)
            .removeClass(this.options.grabClass)
            .attr('class', this.$element.attr('class').replace(new RegExp(this.options.responsiveClass + '-\\S+\\s', 'g'), ''))
            .removeData('owl.carousel');
    };

    /**
     * Operators to calculate right-to-left and left-to-right.
     * @protected
     * @param {Number} [a] - The left side operand.
     * @param {String} [o] - The operator.
     * @param {Number} [b] - The right side operand.
     */
    Owl.prototype.op = function (a, o, b) {
        var rtl = this.settings.rtl;
        switch (o) {
            case '<':
                return rtl ? a > b : a < b;
            case '>':
                return rtl ? a < b : a > b;
            case '>=':
                return rtl ? a <= b : a >= b;
            case '<=':
                return rtl ? a >= b : a <= b;
            default:
                break;
        }
    };

    /**
     * Attaches to an internal event.
     * @protected
     * @param {HTMLElement} element - The event source.
     * @param {String} event - The event name.
     * @param {Function} listener - The event handler to attach.
     * @param {Boolean} capture - Wether the event should be handled at the capturing phase or not.
     */
    Owl.prototype.on = function (element, event, listener, capture) {
        if (element.addEventListener) {
            element.addEventListener(event, listener, capture);
        } else if (element.attachEvent) {
            element.attachEvent('on' + event, listener);
        }
    };

    /**
     * Detaches from an internal event.
     * @protected
     * @param {HTMLElement} element - The event source.
     * @param {String} event - The event name.
     * @param {Function} listener - The attached event handler to detach.
     * @param {Boolean} capture - Wether the attached event handler was registered as a capturing listener or not.
     */
    Owl.prototype.off = function (element, event, listener, capture) {
        if (element.removeEventListener) {
            element.removeEventListener(event, listener, capture);
        } else if (element.detachEvent) {
            element.detachEvent('on' + event, listener);
        }
    };

    /**
     * Triggers a public event.
     * @todo Remove `status`, `relatedTarget` should be used instead.
     * @protected
     * @param {String} name - The event name.
     * @param {*} [data=null] - The event data.
     * @param {String} [namespace=carousel] - The event namespace.
     * @param {String} [state] - The state which is associated with the event.
     * @param {Boolean} [enter=false] - Indicates if the call enters the specified state or not.
     * @returns {Event} - The event arguments.
     */
    Owl.prototype.trigger = function (name, data, namespace, state, enter) {
        var status = {
            item: { count: this._items.length, index: this.current() }
        }, handler = $.camelCase(
            $.grep(['on', name, namespace], function (v) { return v })
                .join('-').toLowerCase()
        ), event = $.Event(
            [name, 'owl', namespace || 'carousel'].join('.').toLowerCase(),
            $.extend({ relatedTarget: this }, status, data)
        );

        if (!this._supress[name]) {
            $.each(this._plugins, function (name, plugin) {
                if (plugin.onTrigger) {
                    plugin.onTrigger(event);
                }
            });

            this.register({ type: Owl.Type.Event, name: name });
            this.$element.trigger(event);

            if (this.settings && typeof this.settings[handler] === 'function') {
                this.settings[handler].call(this, event);
            }
        }

        return event;
    };

    /**
     * Enters a state.
     * @param name - The state name.
     */
    Owl.prototype.enter = function (name) {
        $.each([name].concat(this._states.tags[name] || []), $.proxy(function (i, name) {
            if (this._states.current[name] === undefined) {
                this._states.current[name] = 0;
            }

            this._states.current[name]++;
        }, this));
    };

    /**
     * Leaves a state.
     * @param name - The state name.
     */
    Owl.prototype.leave = function (name) {
        $.each([name].concat(this._states.tags[name] || []), $.proxy(function (i, name) {
            this._states.current[name]--;
        }, this));
    };

    /**
     * Registers an event or state.
     * @public
     * @param {Object} object - The event or state to register.
     */
    Owl.prototype.register = function (object) {
        if (object.type === Owl.Type.Event) {
            if (!$.event.special[object.name]) {
                $.event.special[object.name] = {};
            }

            if (!$.event.special[object.name].owl) {
                var _default = $.event.special[object.name]._default;
                $.event.special[object.name]._default = function (e) {
                    if (_default && _default.apply && (!e.namespace || e.namespace.indexOf('owl') === -1)) {
                        return _default.apply(this, arguments);
                    }
                    return e.namespace && e.namespace.indexOf('owl') > -1;
                };
                $.event.special[object.name].owl = true;
            }
        } else if (object.type === Owl.Type.State) {
            if (!this._states.tags[object.name]) {
                this._states.tags[object.name] = object.tags;
            } else {
                this._states.tags[object.name] = this._states.tags[object.name].concat(object.tags);
            }

            this._states.tags[object.name] = $.grep(this._states.tags[object.name], $.proxy(function (tag, i) {
                return $.inArray(tag, this._states.tags[object.name]) === i;
            }, this));
        }
    };

    /**
     * Suppresses events.
     * @protected
     * @param {Array.<String>} events - The events to suppress.
     */
    Owl.prototype.suppress = function (events) {
        $.each(events, $.proxy(function (index, event) {
            this._supress[event] = true;
        }, this));
    };

    /**
     * Releases suppressed events.
     * @protected
     * @param {Array.<String>} events - The events to release.
     */
    Owl.prototype.release = function (events) {
        $.each(events, $.proxy(function (index, event) {
            delete this._supress[event];
        }, this));
    };

    /**
     * Gets unified pointer coordinates from event.
     * @todo #261
     * @protected
     * @param {Event} - The `mousedown` or `touchstart` event.
     * @returns {Object} - Contains `x` and `y` coordinates of current pointer position.
     */
    Owl.prototype.pointer = function (event) {
        var result = { x: null, y: null };

        event = event.originalEvent || event || window.event;

        event = event.touches && event.touches.length ?
            event.touches[0] : event.changedTouches && event.changedTouches.length ?
                event.changedTouches[0] : event;

        if (event.pageX) {
            result.x = event.pageX;
            result.y = event.pageY;
        } else {
            result.x = event.clientX;
            result.y = event.clientY;
        }

        return result;
    };

    /**
     * Determines if the input is a Number or something that can be coerced to a Number
     * @protected
     * @param {Number|String|Object|Array|Boolean|RegExp|Function|Symbol} - The input to be tested
     * @returns {Boolean} - An indication if the input is a Number or can be coerced to a Number
     */
    Owl.prototype.isNumeric = function (number) {
        return !isNaN(parseFloat(number));
    };

    /**
     * Gets the difference of two vectors.
     * @todo #261
     * @protected
     * @param {Object} - The first vector.
     * @param {Object} - The second vector.
     * @returns {Object} - The difference.
     */
    Owl.prototype.difference = function (first, second) {
        return {
            x: first.x - second.x,
            y: first.y - second.y
        };
    };

    /**
     * The jQuery Plugin for the Owl Carousel
     * @todo Navigation plugin `next` and `prev`
     * @public
     */
    $.fn.owlCarousel = function (option) {
        var args = Array.prototype.slice.call(arguments, 1);

        return this.each(function () {
            var $this = $(this),
                data = $this.data('owl.carousel');

            if (!data) {
                data = new Owl(this, typeof option == 'object' && option);
                $this.data('owl.carousel', data);

                $.each([
                    'next', 'prev', 'to', 'destroy', 'refresh', 'replace', 'add', 'remove'
                ], function (i, event) {
                    data.register({ type: Owl.Type.Event, name: event });
                    data.$element.on(event + '.owl.carousel.core', $.proxy(function (e) {
                        if (e.namespace && e.relatedTarget !== this) {
                            this.suppress([event]);
                            data[event].apply(this, [].slice.call(arguments, 1));
                            this.release([event]);
                        }
                    }, data));
                });
            }

            if (typeof option == 'string' && option.charAt(0) !== '_') {
                data[option].apply(data, args);
            }
        });
    };

    /**
     * The constructor for the jQuery Plugin
     * @public
     */
    $.fn.owlCarousel.Constructor = Owl;

})(window.Zepto || window.jQuery, window, document);

/**
 * AutoRefresh Plugin
 * @version 2.3.4
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {

    /**
     * Creates the auto refresh plugin.
     * @class The Auto Refresh Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var AutoRefresh = function (carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Refresh interval.
         * @protected
         * @type {number}
         */
        this._interval = null;

        /**
         * Whether the element is currently visible or not.
         * @protected
         * @type {Boolean}
         */
        this._visible = null;

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.autoRefresh) {
                    this.watch();
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, AutoRefresh.Defaults, this._core.options);

        // register event handlers
        this._core.$element.on(this._handlers);
    };

    /**
     * Default options.
     * @public
     */
    AutoRefresh.Defaults = {
        autoRefresh: true,
        autoRefreshInterval: 500
    };

    /**
     * Watches the element.
     */
    AutoRefresh.prototype.watch = function () {
        if (this._interval) {
            return;
        }

        this._visible = this._core.isVisible();
        this._interval = window.setInterval($.proxy(this.refresh, this), this._core.settings.autoRefreshInterval);
    };

    /**
     * Refreshes the element.
     */
    AutoRefresh.prototype.refresh = function () {
        if (this._core.isVisible() === this._visible) {
            return;
        }

        this._visible = !this._visible;

        this._core.$element.toggleClass('owl-hidden', !this._visible);

        this._visible && (this._core.invalidate('width') && this._core.refresh());
    };

    /**
     * Destroys the plugin.
     */
    AutoRefresh.prototype.destroy = function () {
        var handler, property;

        window.clearInterval(this._interval);

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.AutoRefresh = AutoRefresh;

})(window.Zepto || window.jQuery, window, document);

/**
 * Lazy Plugin
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {

    /**
     * Creates the lazy plugin.
     * @class The Lazy Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var Lazy = function (carousel) {

        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Already loaded items.
         * @protected
         * @type {Array.<jQuery>}
         */
        this._loaded = [];

        /**
         * Event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel change.owl.carousel resized.owl.carousel': $.proxy(function (e) {
                if (!e.namespace) {
                    return;
                }

                if (!this._core.settings || !this._core.settings.lazyLoad) {
                    return;
                }

                if ((e.property && e.property.name == 'position') || e.type == 'initialized') {
                    var settings = this._core.settings,
                        n = (settings.center && Math.ceil(settings.items / 2) || settings.items),
                        i = ((settings.center && n * -1) || 0),
                        position = (e.property && e.property.value !== undefined ? e.property.value : this._core.current()) + i,
                        clones = this._core.clones().length,
                        load = $.proxy(function (i, v) { this.load(v) }, this);
                    //TODO: Need documentation for this new option
                    if (settings.lazyLoadEager > 0) {
                        n += settings.lazyLoadEager;
                        // If the carousel is looping also preload images that are to the "left"
                        if (settings.loop) {
                            position -= settings.lazyLoadEager;
                            n++;
                        }
                    }

                    while (i++ < n) {
                        this.load(clones / 2 + this._core.relative(position));
                        clones && $.each(this._core.clones(this._core.relative(position)), load);
                        position++;
                    }
                }
            }, this)
        };

        // set the default options
        this._core.options = $.extend({}, Lazy.Defaults, this._core.options);

        // register event handler
        this._core.$element.on(this._handlers);
    };

    /**
     * Default options.
     * @public
     */
    Lazy.Defaults = {
        lazyLoad: false,
        lazyLoadEager: 0
    };

    /**
     * Loads all resources of an item at the specified position.
     * @param {Number} position - The absolute position of the item.
     * @protected
     */
    Lazy.prototype.load = function (position) {
        var $item = this._core.$stage.children().eq(position),
            $elements = $item && $item.find('.owl-lazy');

        if (!$elements || $.inArray($item.get(0), this._loaded) > -1) {
            return;
        }

        $elements.each($.proxy(function (index, element) {
            var $element = $(element), image,
                url = (window.devicePixelRatio > 1 && $element.attr('data-src-retina')) || $element.attr('data-src') || $element.attr('data-srcset');

            this._core.trigger('load', { element: $element, url: url }, 'lazy');

            if ($element.is('img')) {
                $element.one('load.owl.lazy', $.proxy(function () {
                    $element.css('opacity', 1);
                    this._core.trigger('loaded', { element: $element, url: url }, 'lazy');
                }, this)).attr('src', url);
            } else if ($element.is('source')) {
                $element.one('load.owl.lazy', $.proxy(function () {
                    this._core.trigger('loaded', { element: $element, url: url }, 'lazy');
                }, this)).attr('srcset', url);
            } else {
                image = new Image();
                image.onload = $.proxy(function () {
                    $element.css({
                        'background-image': 'url("' + url + '")',
                        'opacity': '1'
                    });
                    this._core.trigger('loaded', { element: $element, url: url }, 'lazy');
                }, this);
                image.src = url;
            }
        }, this));

        this._loaded.push($item.get(0));
    };

    /**
     * Destroys the plugin.
     * @public
     */
    Lazy.prototype.destroy = function () {
        var handler, property;

        for (handler in this.handlers) {
            this._core.$element.off(handler, this.handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Lazy = Lazy;

})(window.Zepto || window.jQuery, window, document);

/**
 * AutoHeight Plugin
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {

    /**
     * Creates the auto height plugin.
     * @class The Auto Height Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var AutoHeight = function (carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        this._previousHeight = null;

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel refreshed.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.autoHeight) {
                    this.update();
                }
            }, this),
            'changed.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.autoHeight && e.property.name === 'position') {
                    this.update();
                }
            }, this),
            'loaded.owl.lazy': $.proxy(function (e) {
                if (e.namespace && this._core.settings.autoHeight
                    && e.element.closest('.' + this._core.settings.itemClass).index() === this._core.current()) {
                    this.update();
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, AutoHeight.Defaults, this._core.options);

        // register event handlers
        this._core.$element.on(this._handlers);
        this._intervalId = null;
        var refThis = this;

        // These changes have been taken from a PR by gavrochelegnou proposed in #1575
        // and have been made compatible with the latest jQuery version
        $(window).on('load', function () {
            if (refThis._core.settings.autoHeight) {
                refThis.update();
            }
        });

        // Autoresize the height of the carousel when window is resized
        // When carousel has images, the height is dependent on the width
        // and should also change on resize
        $(window).resize(function () {
            if (refThis._core.settings.autoHeight) {
                if (refThis._intervalId != null) {
                    clearTimeout(refThis._intervalId);
                }

                refThis._intervalId = setTimeout(function () {
                    refThis.update();
                }, 250);
            }
        });

    };

    /**
     * Default options.
     * @public
     */
    AutoHeight.Defaults = {
        autoHeight: false,
        autoHeightClass: 'owl-height'
    };

    /**
     * Updates the view.
     */
    AutoHeight.prototype.update = function () {
        var start = this._core._current,
            end = start + this._core.settings.items,
            lazyLoadEnabled = this._core.settings.lazyLoad,
            visible = this._core.$stage.children().toArray().slice(start, end),
            heights = [],
            maxheight = 0;

        $.each(visible, function (index, item) {
            heights.push($(item).height());
        });

        maxheight = Math.max.apply(null, heights);

        if (maxheight <= 1 && lazyLoadEnabled && this._previousHeight) {
            maxheight = this._previousHeight;
        }

        this._previousHeight = maxheight;

        this._core.$stage.parent()
            .height(maxheight)
            .addClass(this._core.settings.autoHeightClass);
    };

    AutoHeight.prototype.destroy = function () {
        var handler, property;

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] !== 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.AutoHeight = AutoHeight;

})(window.Zepto || window.jQuery, window, document);

/**
 * Video Plugin
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {

    /**
     * Creates the video plugin.
     * @class The Video Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var Video = function (carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Cache all video URLs.
         * @protected
         * @type {Object}
         */
        this._videos = {};

        /**
         * Current playing item.
         * @protected
         * @type {jQuery}
         */
        this._playing = null;

        /**
         * All event handlers.
         * @todo The cloned content removale is too late
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel': $.proxy(function (e) {
                if (e.namespace) {
                    this._core.register({ type: 'state', name: 'playing', tags: ['interacting'] });
                }
            }, this),
            'resize.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.video && this.isInFullScreen()) {
                    e.preventDefault();
                }
            }, this),
            'refreshed.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.is('resizing')) {
                    this._core.$stage.find('.cloned .owl-video-frame').remove();
                }
            }, this),
            'changed.owl.carousel': $.proxy(function (e) {
                if (e.namespace && e.property.name === 'position' && this._playing) {
                    this.stop();
                }
            }, this),
            'prepared.owl.carousel': $.proxy(function (e) {
                if (!e.namespace) {
                    return;
                }

                var $element = $(e.content).find('.owl-video');

                if ($element.length) {
                    $element.css('display', 'none');
                    this.fetch($element, $(e.content));
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, Video.Defaults, this._core.options);

        // register event handlers
        this._core.$element.on(this._handlers);

        this._core.$element.on('click.owl.video', '.owl-video-play-icon', $.proxy(function (e) {
            this.play(e);
        }, this));
    };

    /**
     * Default options.
     * @public
     */
    Video.Defaults = {
        video: false,
        videoHeight: false,
        videoWidth: false
    };

    /**
     * Gets the video ID and the type (YouTube/Vimeo/vzaar only).
     * @protected
     * @param {jQuery} target - The target containing the video data.
     * @param {jQuery} item - The item containing the video.
     */
    Video.prototype.fetch = function (target, item) {
        var type = (function () {
            if (target.attr('data-vimeo-id')) {
                return 'vimeo';
            } else if (target.attr('data-vzaar-id')) {
                return 'vzaar'
            } else {
                return 'youtube';
            }
        })(),
            id = target.attr('data-vimeo-id') || target.attr('data-youtube-id') || target.attr('data-vzaar-id'),
            width = target.attr('data-width') || this._core.settings.videoWidth,
            height = target.attr('data-height') || this._core.settings.videoHeight,
            url = target.attr('href');

        if (url) {

            /*
                    Parses the id's out of the following urls (and probably more):
                    https://www.youtube.com/watch?v=:id
                    https://youtu.be/:id
                    https://vimeo.com/:id
                    https://vimeo.com/channels/:channel/:id
                    https://vimeo.com/groups/:group/videos/:id
                    https://app.vzaar.com/videos/:id

                    Visual example: https://regexper.com/#(http%3A%7Chttps%3A%7C)%5C%2F%5C%2F(player.%7Cwww.%7Capp.)%3F(vimeo%5C.com%7Cyoutu(be%5C.com%7C%5C.be%7Cbe%5C.googleapis%5C.com)%7Cvzaar%5C.com)%5C%2F(video%5C%2F%7Cvideos%5C%2F%7Cembed%5C%2F%7Cchannels%5C%2F.%2B%5C%2F%7Cgroups%5C%2F.%2B%5C%2F%7Cwatch%5C%3Fv%3D%7Cv%5C%2F)%3F(%5BA-Za-z0-9._%25-%5D*)(%5C%26%5CS%2B)%3F
            */

            id = url.match(/(http:|https:|)\/\/(player.|www.|app.)?(vimeo\.com|youtu(be\.com|\.be|be\.googleapis\.com|be\-nocookie\.com)|vzaar\.com)\/(video\/|videos\/|embed\/|channels\/.+\/|groups\/.+\/|watch\?v=|v\/)?([A-Za-z0-9._%-]*)(\&\S+)?/);

            if (id[3].indexOf('youtu') > -1) {
                type = 'youtube';
            } else if (id[3].indexOf('vimeo') > -1) {
                type = 'vimeo';
            } else if (id[3].indexOf('vzaar') > -1) {
                type = 'vzaar';
            } else {
                throw new Error('Video URL not supported.');
            }
            id = id[6];
        } else {
            throw new Error('Missing video URL.');
        }

        this._videos[url] = {
            type: type,
            id: id,
            width: width,
            height: height
        };

        item.attr('data-video', url);

        this.thumbnail(target, this._videos[url]);
    };

    /**
     * Creates video thumbnail.
     * @protected
     * @param {jQuery} target - The target containing the video data.
     * @param {Object} info - The video info object.
     * @see `fetch`
     */
    Video.prototype.thumbnail = function (target, video) {
        var tnLink,
            icon,
            path,
            dimensions = video.width && video.height ? 'width:' + video.width + 'px;height:' + video.height + 'px;' : '',
            customTn = target.find('img'),
            srcType = 'src',
            lazyClass = '',
            settings = this._core.settings,
            create = function (path) {
                icon = '<div class="owl-video-play-icon"></div>';

                if (settings.lazyLoad) {
                    tnLink = $('<div/>', {
                        "class": 'owl-video-tn ' + lazyClass,
                        "srcType": path
                    });
                } else {
                    tnLink = $('<div/>', {
                        "class": "owl-video-tn",
                        "style": 'opacity:1;background-image:url(' + path + ')'
                    });
                }
                target.after(tnLink);
                target.after(icon);
            };

        // wrap video content into owl-video-wrapper div
        target.wrap($('<div/>', {
            "class": "owl-video-wrapper",
            "style": dimensions
        }));

        if (this._core.settings.lazyLoad) {
            srcType = 'data-src';
            lazyClass = 'owl-lazy';
        }

        // custom thumbnail
        if (customTn.length) {
            create(customTn.attr(srcType));
            customTn.remove();
            return false;
        }

        if (video.type === 'youtube') {
            path = "//img.youtube.com/vi/" + video.id + "/hqdefault.jpg";
            create(path);
        } else if (video.type === 'vimeo') {
            $.ajax({
                type: 'GET',
                url: '//vimeo.com/api/v2/video/' + video.id + '.json',
                jsonp: 'callback',
                dataType: 'jsonp',
                success: function (data) {
                    path = data[0].thumbnail_large;
                    create(path);
                }
            });
        } else if (video.type === 'vzaar') {
            $.ajax({
                type: 'GET',
                url: '//vzaar.com/api/videos/' + video.id + '.json',
                jsonp: 'callback',
                dataType: 'jsonp',
                success: function (data) {
                    path = data.framegrab_url;
                    create(path);
                }
            });
        }
    };

    /**
     * Stops the current video.
     * @public
     */
    Video.prototype.stop = function () {
        this._core.trigger('stop', null, 'video');
        this._playing.find('.owl-video-frame').remove();
        this._playing.removeClass('owl-video-playing');
        this._playing = null;
        this._core.leave('playing');
        this._core.trigger('stopped', null, 'video');
    };

    /**
     * Starts the current video.
     * @public
     * @param {Event} event - The event arguments.
     */
    Video.prototype.play = function (event) {
        var target = $(event.target),
            item = target.closest('.' + this._core.settings.itemClass),
            video = this._videos[item.attr('data-video')],
            width = video.width || '100%',
            height = video.height || this._core.$stage.height(),
            html,
            iframe;

        if (this._playing) {
            return;
        }

        this._core.enter('playing');
        this._core.trigger('play', null, 'video');

        item = this._core.items(this._core.relative(item.index()));

        this._core.reset(item.index());

        html = $('<iframe frameborder="0" allowfullscreen mozallowfullscreen webkitAllowFullScreen ></iframe>');
        html.attr('height', height);
        html.attr('width', width);
        if (video.type === 'youtube') {
            html.attr('src', '//www.youtube.com/embed/' + video.id + '?autoplay=1&rel=0&v=' + video.id);
        } else if (video.type === 'vimeo') {
            html.attr('src', '//player.vimeo.com/video/' + video.id + '?autoplay=1');
        } else if (video.type === 'vzaar') {
            html.attr('src', '//view.vzaar.com/' + video.id + '/player?autoplay=true');
        }

        iframe = $(html).wrap('<div class="owl-video-frame" />').insertAfter(item.find('.owl-video'));

        this._playing = item.addClass('owl-video-playing');
    };

    /**
     * Checks whether an video is currently in full screen mode or not.
     * @todo Bad style because looks like a readonly method but changes members.
     * @protected
     * @returns {Boolean}
     */
    Video.prototype.isInFullScreen = function () {
        var element = document.fullscreenElement || document.mozFullScreenElement ||
            document.webkitFullscreenElement;

        return element && $(element).parent().hasClass('owl-video-frame');
    };

    /**
     * Destroys the plugin.
     */
    Video.prototype.destroy = function () {
        var handler, property;

        this._core.$element.off('click.owl.video');

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Video = Video;

})(window.Zepto || window.jQuery, window, document);

/**
 * Animate Plugin
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {

    /**
     * Creates the animate plugin.
     * @class The Navigation Plugin
     * @param {Owl} scope - The Owl Carousel
     */
    var Animate = function (scope) {
        this.core = scope;
        this.core.options = $.extend({}, Animate.Defaults, this.core.options);
        this.swapping = true;
        this.previous = undefined;
        this.next = undefined;

        this.handlers = {
            'change.owl.carousel': $.proxy(function (e) {
                if (e.namespace && e.property.name == 'position') {
                    this.previous = this.core.current();
                    this.next = e.property.value;
                }
            }, this),
            'drag.owl.carousel dragged.owl.carousel translated.owl.carousel': $.proxy(function (e) {
                if (e.namespace) {
                    this.swapping = e.type == 'translated';
                }
            }, this),
            'translate.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this.swapping && (this.core.options.animateOut || this.core.options.animateIn)) {
                    this.swap();
                }
            }, this)
        };

        this.core.$element.on(this.handlers);
    };

    /**
     * Default options.
     * @public
     */
    Animate.Defaults = {
        animateOut: false,
        animateIn: false
    };

    /**
     * Toggles the animation classes whenever an translations starts.
     * @protected
     * @returns {Boolean|undefined}
     */
    Animate.prototype.swap = function () {

        if (this.core.settings.items !== 1) {
            return;
        }

        if (!$.support.animation || !$.support.transition) {
            return;
        }

        this.core.speed(0);

        var left,
            clear = $.proxy(this.clear, this),
            previous = this.core.$stage.children().eq(this.previous),
            next = this.core.$stage.children().eq(this.next),
            incoming = this.core.settings.animateIn,
            outgoing = this.core.settings.animateOut;

        if (this.core.current() === this.previous) {
            return;
        }

        if (outgoing) {
            left = this.core.coordinates(this.previous) - this.core.coordinates(this.next);
            previous.one($.support.animation.end, clear)
                .css({ 'left': left + 'px' })
                .addClass('animated owl-animated-out')
                .addClass(outgoing);
        }

        if (incoming) {
            next.one($.support.animation.end, clear)
                .addClass('animated owl-animated-in')
                .addClass(incoming);
        }
    };

    Animate.prototype.clear = function (e) {
        $(e.target).css({ 'left': '' })
            .removeClass('animated owl-animated-out owl-animated-in')
            .removeClass(this.core.settings.animateIn)
            .removeClass(this.core.settings.animateOut);
        this.core.onTransitionEnd();
    };

    /**
     * Destroys the plugin.
     * @public
     */
    Animate.prototype.destroy = function () {
        var handler, property;

        for (handler in this.handlers) {
            this.core.$element.off(handler, this.handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Animate = Animate;

})(window.Zepto || window.jQuery, window, document);

/**
 * Autoplay Plugin
 * @version 2.3.4
 * @author Bartosz Wojciechowski
 * @author Artus Kolanowski
 * @author David Deutsch
 * @author Tom De Caluwé
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {

    /**
     * Creates the autoplay plugin.
     * @class The Autoplay Plugin
     * @param {Owl} scope - The Owl Carousel
     */
    var Autoplay = function (carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * The autoplay timeout id.
         * @type {Number}
         */
        this._call = null;

        /**
         * Depending on the state of the plugin, this variable contains either
         * the start time of the timer or the current timer value if it's
         * paused. Since we start in a paused state we initialize the timer
         * value.
         * @type {Number}
         */
        this._time = 0;

        /**
         * Stores the timeout currently used.
         * @type {Number}
         */
        this._timeout = 0;

        /**
         * Indicates whenever the autoplay is paused.
         * @type {Boolean}
         */
        this._paused = true;

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'changed.owl.carousel': $.proxy(function (e) {
                if (e.namespace && e.property.name === 'settings') {
                    if (this._core.settings.autoplay) {
                        this.play();
                    } else {
                        this.stop();
                    }
                } else if (e.namespace && e.property.name === 'position' && this._paused) {
                    // Reset the timer. This code is triggered when the position
                    // of the carousel was changed through user interaction.
                    this._time = 0;
                }
            }, this),
            'initialized.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.autoplay) {
                    this.play();
                }
            }, this),
            'play.owl.autoplay': $.proxy(function (e, t, s) {
                if (e.namespace) {
                    this.play(t, s);
                }
            }, this),
            'stop.owl.autoplay': $.proxy(function (e) {
                if (e.namespace) {
                    this.stop();
                }
            }, this),
            'mouseover.owl.autoplay': $.proxy(function () {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.pause();
                }
            }, this),
            'mouseleave.owl.autoplay': $.proxy(function () {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.play();
                }
            }, this),
            'touchstart.owl.core': $.proxy(function () {
                if (this._core.settings.autoplayHoverPause && this._core.is('rotating')) {
                    this.pause();
                }
            }, this),
            'touchend.owl.core': $.proxy(function () {
                if (this._core.settings.autoplayHoverPause) {
                    this.play();
                }
            }, this)
        };

        // register event handlers
        this._core.$element.on(this._handlers);

        // set default options
        this._core.options = $.extend({}, Autoplay.Defaults, this._core.options);
    };

    /**
     * Default options.
     * @public
     */
    Autoplay.Defaults = {
        autoplay: false,
        autoplayTimeout: 5000,
        autoplayHoverPause: false,
        autoplaySpeed: false
    };

    /**
     * Transition to the next slide and set a timeout for the next transition.
     * @private
     * @param {Number} [speed] - The animation speed for the animations.
     */
    Autoplay.prototype._next = function (speed) {
        this._call = window.setTimeout(
            $.proxy(this._next, this, speed),
            this._timeout * (Math.round(this.read() / this._timeout) + 1) - this.read()
        );

        if (this._core.is('interacting') || document.hidden) {
            return;
        }
        this._core.next(speed || this._core.settings.autoplaySpeed);
    }

    /**
     * Reads the current timer value when the timer is playing.
     * @public
     */
    Autoplay.prototype.read = function () {
        return new Date().getTime() - this._time;
    };

    /**
     * Starts the autoplay.
     * @public
     * @param {Number} [timeout] - The interval before the next animation starts.
     * @param {Number} [speed] - The animation speed for the animations.
     */
    Autoplay.prototype.play = function (timeout, speed) {
        var elapsed;

        if (!this._core.is('rotating')) {
            this._core.enter('rotating');
        }

        timeout = timeout || this._core.settings.autoplayTimeout;

        // Calculate the elapsed time since the last transition. If the carousel
        // wasn't playing this calculation will yield zero.
        elapsed = Math.min(this._time % (this._timeout || timeout), timeout);

        if (this._paused) {
            // Start the clock.
            this._time = this.read();
            this._paused = false;
        } else {
            // Clear the active timeout to allow replacement.
            window.clearTimeout(this._call);
        }

        // Adjust the origin of the timer to match the new timeout value.
        this._time += this.read() % timeout - elapsed;

        this._timeout = timeout;
        this._call = window.setTimeout($.proxy(this._next, this, speed), timeout - elapsed);
    };

    /**
     * Stops the autoplay.
     * @public
     */
    Autoplay.prototype.stop = function () {
        if (this._core.is('rotating')) {
            // Reset the clock.
            this._time = 0;
            this._paused = true;

            window.clearTimeout(this._call);
            this._core.leave('rotating');
        }
    };

    /**
     * Pauses the autoplay.
     * @public
     */
    Autoplay.prototype.pause = function () {
        if (this._core.is('rotating') && !this._paused) {
            // Pause the clock.
            this._time = this.read();
            this._paused = true;

            window.clearTimeout(this._call);
        }
    };

    /**
     * Destroys the plugin.
     */
    Autoplay.prototype.destroy = function () {
        var handler, property;

        this.stop();

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.autoplay = Autoplay;

})(window.Zepto || window.jQuery, window, document);

/**
 * Navigation Plugin
 * @version 2.3.4
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {
    'use strict';

    /**
     * Creates the navigation plugin.
     * @class The Navigation Plugin
     * @param {Owl} carousel - The Owl Carousel.
     */
    var Navigation = function (carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Indicates whether the plugin is initialized or not.
         * @protected
         * @type {Boolean}
         */
        this._initialized = false;

        /**
         * The current paging indexes.
         * @protected
         * @type {Array}
         */
        this._pages = [];

        /**
         * All DOM elements of the user interface.
         * @protected
         * @type {Object}
         */
        this._controls = {};

        /**
         * Markup for an indicator.
         * @protected
         * @type {Array.<String>}
         */
        this._templates = [];

        /**
         * The carousel element.
         * @type {jQuery}
         */
        this.$element = this._core.$element;

        /**
         * Overridden methods of the carousel.
         * @protected
         * @type {Object}
         */
        this._overrides = {
            next: this._core.next,
            prev: this._core.prev,
            to: this._core.to
        };

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'prepared.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.push('<div class="' + this._core.settings.dotClass + '">' +
                        $(e.content).find('[data-dot]').addBack('[data-dot]').attr('data-dot') + '</div>');
                }
            }, this),
            'added.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.splice(e.position, 0, this._templates.pop());
                }
            }, this),
            'remove.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.dotsData) {
                    this._templates.splice(e.position, 1);
                }
            }, this),
            'changed.owl.carousel': $.proxy(function (e) {
                if (e.namespace && e.property.name == 'position') {
                    this.draw();
                }
            }, this),
            'initialized.owl.carousel': $.proxy(function (e) {
                if (e.namespace && !this._initialized) {
                    this._core.trigger('initialize', null, 'navigation');
                    this.initialize();
                    this.update();
                    this.draw();
                    this._initialized = true;
                    this._core.trigger('initialized', null, 'navigation');
                }
            }, this),
            'refreshed.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._initialized) {
                    this._core.trigger('refresh', null, 'navigation');
                    this.update();
                    this.draw();
                    this._core.trigger('refreshed', null, 'navigation');
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, Navigation.Defaults, this._core.options);

        // register event handlers
        this.$element.on(this._handlers);
    };

    /**
     * Default options.
     * @public
     * @todo Rename `slideBy` to `navBy`
     */
    Navigation.Defaults = {
        nav: false,
        navText: [
            '<span aria-label="' + 'Previous' + '">&#x2039;</span>',
            '<span aria-label="' + 'Next' + '">&#x203a;</span>'
        ],
        navSpeed: false,
        navElement: 'button type="button" role="presentation"',
        navContainer: false,
        navContainerClass: 'owl-nav',
        navClass: [
            'owl-prev',
            'owl-next'
        ],
        slideBy: 1,
        dotClass: 'owl-dot',
        dotsClass: 'owl-dots',
        dots: true,
        dotsEach: false,
        dotsData: false,
        dotsSpeed: false,
        dotsContainer: false
    };

    /**
     * Initializes the layout of the plugin and extends the carousel.
     * @protected
     */
    Navigation.prototype.initialize = function () {
        var override,
            settings = this._core.settings;

        // create DOM structure for relative navigation
        this._controls.$relative = (settings.navContainer ? $(settings.navContainer)
            : $('<div>').addClass(settings.navContainerClass).appendTo(this.$element)).addClass('disabled');

        this._controls.$previous = $('<' + settings.navElement + '>')
            .addClass(settings.navClass[0])
            .html(settings.navText[0])
            .prependTo(this._controls.$relative)
            .on('click', $.proxy(function (e) {
                this.prev(settings.navSpeed);
            }, this));
        this._controls.$next = $('<' + settings.navElement + '>')
            .addClass(settings.navClass[1])
            .html(settings.navText[1])
            .appendTo(this._controls.$relative)
            .on('click', $.proxy(function (e) {
                this.next(settings.navSpeed);
            }, this));

        // create DOM structure for absolute navigation
        if (!settings.dotsData) {
            this._templates = [$('<button role="button">')
                .addClass(settings.dotClass)
                .append($('<span>'))
                .prop('outerHTML')];
        }

        this._controls.$absolute = (settings.dotsContainer ? $(settings.dotsContainer)
            : $('<div>').addClass(settings.dotsClass).appendTo(this.$element)).addClass('disabled');

        this._controls.$absolute.on('click', 'button', $.proxy(function (e) {
            var index = $(e.target).parent().is(this._controls.$absolute)
                ? $(e.target).index() : $(e.target).parent().index();

            e.preventDefault();

            this.to(index, settings.dotsSpeed);
        }, this));

        /*$el.on('focusin', function() {
            $(document).off(".carousel");

            $(document).on('keydown.carousel', function(e) {
                if(e.keyCode == 37) {
                    $el.trigger('prev.owl')
                }
                if(e.keyCode == 39) {
                    $el.trigger('next.owl')
                }
            });
        });*/

        // override public methods of the carousel
        for (override in this._overrides) {
            this._core[override] = $.proxy(this[override], this);
        }
    };

    /**
     * Destroys the plugin.
     * @protected
     */
    Navigation.prototype.destroy = function () {
        var handler, control, property, override, settings;
        settings = this._core.settings;

        for (handler in this._handlers) {
            this.$element.off(handler, this._handlers[handler]);
        }
        for (control in this._controls) {
            if (control === '$relative' && settings.navContainer) {
                this._controls[control].html('');
            } else {
                this._controls[control].remove();
            }
        }
        for (override in this.overides) {
            this._core[override] = this._overrides[override];
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    /**
     * Updates the internal state.
     * @protected
     */
    Navigation.prototype.update = function () {
        var i, j, k,
            lower = this._core.clones().length / 2,
            upper = lower + this._core.items().length,
            maximum = this._core.maximum(true),
            settings = this._core.settings,
            size = settings.center || settings.autoWidth || settings.dotsData
                ? 1 : settings.dotsEach || settings.items;

        if (settings.slideBy !== 'page') {
            settings.slideBy = Math.min(settings.slideBy, settings.items);
        }

        if (settings.dots || settings.slideBy == 'page') {
            this._pages = [];

            for (i = lower, j = 0, k = 0; i < upper; i++) {
                if (j >= size || j === 0) {
                    this._pages.push({
                        start: Math.min(maximum, i - lower),
                        end: i - lower + size - 1
                    });
                    if (Math.min(maximum, i - lower) === maximum) {
                        break;
                    }
                    j = 0, ++k;
                }
                j += this._core.mergers(this._core.relative(i));
            }
        }
    };

    /**
     * Draws the user interface.
     * @todo The option `dotsData` wont work.
     * @protected
     */
    Navigation.prototype.draw = function () {
        var difference,
            settings = this._core.settings,
            disabled = this._core.items().length <= settings.items,
            index = this._core.relative(this._core.current()),
            loop = settings.loop || settings.rewind;

        this._controls.$relative.toggleClass('disabled', !settings.nav || disabled);

        if (settings.nav) {
            this._controls.$previous.toggleClass('disabled', !loop && index <= this._core.minimum(true));
            this._controls.$next.toggleClass('disabled', !loop && index >= this._core.maximum(true));
        }

        this._controls.$absolute.toggleClass('disabled', !settings.dots || disabled);

        if (settings.dots) {
            difference = this._pages.length - this._controls.$absolute.children().length;

            if (settings.dotsData && difference !== 0) {
                this._controls.$absolute.html(this._templates.join(''));
            } else if (difference > 0) {
                this._controls.$absolute.append(new Array(difference + 1).join(this._templates[0]));
            } else if (difference < 0) {
                this._controls.$absolute.children().slice(difference).remove();
            }

            this._controls.$absolute.find('.active').removeClass('active');
            this._controls.$absolute.children().eq($.inArray(this.current(), this._pages)).addClass('active');
        }
    };

    /**
     * Extends event data.
     * @protected
     * @param {Event} event - The event object which gets thrown.
     */
    Navigation.prototype.onTrigger = function (event) {
        var settings = this._core.settings;

        event.page = {
            index: $.inArray(this.current(), this._pages),
            count: this._pages.length,
            size: settings && (settings.center || settings.autoWidth || settings.dotsData
                ? 1 : settings.dotsEach || settings.items)
        };
    };

    /**
     * Gets the current page position of the carousel.
     * @protected
     * @returns {Number}
     */
    Navigation.prototype.current = function () {
        var current = this._core.relative(this._core.current());
        return $.grep(this._pages, $.proxy(function (page, index) {
            return page.start <= current && page.end >= current;
        }, this)).pop();
    };

    /**
     * Gets the current succesor/predecessor position.
     * @protected
     * @returns {Number}
     */
    Navigation.prototype.getPosition = function (successor) {
        var position, length,
            settings = this._core.settings;

        if (settings.slideBy == 'page') {
            position = $.inArray(this.current(), this._pages);
            length = this._pages.length;
            successor ? ++position : --position;
            position = this._pages[((position % length) + length) % length].start;
        } else {
            position = this._core.relative(this._core.current());
            length = this._core.items().length;
            successor ? position += settings.slideBy : position -= settings.slideBy;
        }

        return position;
    };

    /**
     * Slides to the next item or page.
     * @public
     * @param {Number} [speed=false] - The time in milliseconds for the transition.
     */
    Navigation.prototype.next = function (speed) {
        $.proxy(this._overrides.to, this._core)(this.getPosition(true), speed);
    };

    /**
     * Slides to the previous item or page.
     * @public
     * @param {Number} [speed=false] - The time in milliseconds for the transition.
     */
    Navigation.prototype.prev = function (speed) {
        $.proxy(this._overrides.to, this._core)(this.getPosition(false), speed);
    };

    /**
     * Slides to the specified item or page.
     * @public
     * @param {Number} position - The position of the item or page.
     * @param {Number} [speed] - The time in milliseconds for the transition.
     * @param {Boolean} [standard=false] - Whether to use the standard behaviour or not.
     */
    Navigation.prototype.to = function (position, speed, standard) {
        var length;

        if (!standard && this._pages.length) {
            length = this._pages.length;
            $.proxy(this._overrides.to, this._core)(this._pages[((position % length) + length) % length].start, speed);
        } else {
            $.proxy(this._overrides.to, this._core)(position, speed);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Navigation = Navigation;

})(window.Zepto || window.jQuery, window, document);

/**
 * Hash Plugin
 * @version 2.3.4
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {
    'use strict';

    /**
     * Creates the hash plugin.
     * @class The Hash Plugin
     * @param {Owl} carousel - The Owl Carousel
     */
    var Hash = function (carousel) {
        /**
         * Reference to the core.
         * @protected
         * @type {Owl}
         */
        this._core = carousel;

        /**
         * Hash index for the items.
         * @protected
         * @type {Object}
         */
        this._hashes = {};

        /**
         * The carousel element.
         * @type {jQuery}
         */
        this.$element = this._core.$element;

        /**
         * All event handlers.
         * @protected
         * @type {Object}
         */
        this._handlers = {
            'initialized.owl.carousel': $.proxy(function (e) {
                if (e.namespace && this._core.settings.startPosition === 'URLHash') {
                    $(window).trigger('hashchange.owl.navigation');
                }
            }, this),
            'prepared.owl.carousel': $.proxy(function (e) {
                if (e.namespace) {
                    var hash = $(e.content).find('[data-hash]').addBack('[data-hash]').attr('data-hash');

                    if (!hash) {
                        return;
                    }

                    this._hashes[hash] = e.content;
                }
            }, this),
            'changed.owl.carousel': $.proxy(function (e) {
                if (e.namespace && e.property.name === 'position') {
                    var current = this._core.items(this._core.relative(this._core.current())),
                        hash = $.map(this._hashes, function (item, hash) {
                            return item === current ? hash : null;
                        }).join();

                    if (!hash || window.location.hash.slice(1) === hash) {
                        return;
                    }

                    window.location.hash = hash;
                }
            }, this)
        };

        // set default options
        this._core.options = $.extend({}, Hash.Defaults, this._core.options);

        // register the event handlers
        this.$element.on(this._handlers);

        // register event listener for hash navigation
        $(window).on('hashchange.owl.navigation', $.proxy(function (e) {
            var hash = window.location.hash.substring(1),
                items = this._core.$stage.children(),
                position = this._hashes[hash] && items.index(this._hashes[hash]);

            if (position === undefined || position === this._core.current()) {
                return;
            }

            this._core.to(this._core.relative(position), false, true);
        }, this));
    };

    /**
     * Default options.
     * @public
     */
    Hash.Defaults = {
        URLhashListener: false
    };

    /**
     * Destroys the plugin.
     * @public
     */
    Hash.prototype.destroy = function () {
        var handler, property;

        $(window).off('hashchange.owl.navigation');

        for (handler in this._handlers) {
            this._core.$element.off(handler, this._handlers[handler]);
        }
        for (property in Object.getOwnPropertyNames(this)) {
            typeof this[property] != 'function' && (this[property] = null);
        }
    };

    $.fn.owlCarousel.Constructor.Plugins.Hash = Hash;

})(window.Zepto || window.jQuery, window, document);

/**
 * Support Plugin
 *
 * @version 2.3.4
 * @author Vivid Planet Software GmbH
 * @author Artus Kolanowski
 * @author David Deutsch
 * @license The MIT License (MIT)
 */
; (function ($, window, document, undefined) {

    var style = $('<support>').get(0).style,
        prefixes = 'Webkit Moz O ms'.split(' '),
        events = {
            transition: {
                end: {
                    WebkitTransition: 'webkitTransitionEnd',
                    MozTransition: 'transitionend',
                    OTransition: 'oTransitionEnd',
                    transition: 'transitionend'
                }
            },
            animation: {
                end: {
                    WebkitAnimation: 'webkitAnimationEnd',
                    MozAnimation: 'animationend',
                    OAnimation: 'oAnimationEnd',
                    animation: 'animationend'
                }
            }
        },
        tests = {
            csstransforms: function () {
                return !!test('transform');
            },
            csstransforms3d: function () {
                return !!test('perspective');
            },
            csstransitions: function () {
                return !!test('transition');
            },
            cssanimations: function () {
                return !!test('animation');
            }
        };

    function test(property, prefixed) {
        var result = false,
            upper = property.charAt(0).toUpperCase() + property.slice(1);

        $.each((property + ' ' + prefixes.join(upper + ' ') + upper).split(' '), function (i, property) {
            if (style[property] !== undefined) {
                result = prefixed ? property : true;
                return false;
            }
        });

        return result;
    }

    function prefixed(property) {
        return test(property, true);
    }

    if (tests.csstransitions()) {
        /* jshint -W053 */
        $.support.transition = new String(prefixed('transition'))
        $.support.transition.end = events.transition.end[$.support.transition];
    }

    if (tests.cssanimations()) {
        /* jshint -W053 */
        $.support.animation = new String(prefixed('animation'))
        $.support.animation.end = events.animation.end[$.support.animation];
    }

    if (tests.csstransforms()) {
        /* jshint -W053 */
        $.support.transform = new String(prefixed('transform'));
        $.support.transform3d = tests.csstransforms3d();
    }

})(window.Zepto || window.jQuery, window, document);


// srolltrigger

/*!
 * ScrollTrigger 3.11.5-beta
 * https://greensock.com
 * 
 * @license Copyright 2023, GreenSock. All rights reserved.
 * Subject to the terms at https://greensock.com/standard-license or for Club GreenSock members, the agreement issued with that membership.
 * @author: Jack Doyle, jack@greensock.com
 */

!function (e, t) { "object" == typeof exports && "undefined" != typeof module ? t(exports) : "function" == typeof define && define.amd ? define(["exports"], t) : t((e = e || self).window = e.window || {}) }(this, function (e) { "use strict"; function _defineProperties(e, t) { for (var r = 0; r < t.length; r++) { var n = t[r]; n.enumerable = n.enumerable || !1, n.configurable = !0, "value" in n && (n.writable = !0), Object.defineProperty(e, n.key, n) } } function r() { return we || "undefined" != typeof window && (we = window.gsap) && we.registerPlugin && we } function z(e, t) { return ~qe.indexOf(e) && qe[qe.indexOf(e) + 1][t] } function A(e) { return !!~t.indexOf(e) } function B(e, t, r, n, o) { return e.addEventListener(t, r, { passive: !n, capture: !!o }) } function C(e, t, r, n) { return e.removeEventListener(t, r, !!n) } function F() { return Be && Be.isPressed || ze.cache++ } function G(r, n) { function Uc(e) { if (e || 0 === e) { o && (Te.history.scrollRestoration = "manual"); var t = Be && Be.isPressed; e = Uc.v = Math.round(e) || (Be && Be.iOS ? 1 : 0), r(e), Uc.cacheID = ze.cache, t && i("ss", e) } else (n || ze.cache !== Uc.cacheID || i("ref")) && (Uc.cacheID = ze.cache, Uc.v = r()); return Uc.v + Uc.offset } return Uc.offset = 0, r && Uc } function J(e) { return we.utils.toArray(e)[0] || ("string" == typeof e && !1 !== we.config().nullTargetWarn ? console.warn("Element not found:", e) : null) } function K(t, e) { var r = e.s, n = e.sc; A(t) && (t = Ce.scrollingElement || ke); var o = ze.indexOf(t), i = n === Ne.sc ? 1 : 2; ~o || (o = ze.push(t) - 1), ze[o + i] || t.addEventListener("scroll", F); var a = ze[o + i], s = a || (ze[o + i] = G(z(t, r), !0) || (A(t) ? n : G(function (e) { return arguments.length ? t[r] = e : t[r] }))); return s.target = t, a || (s.smooth = "smooth" === we.getProperty(t, "scrollBehavior")), s } function L(e, t, o) { function qd(e, t) { var r = Ie(); t || n < r - s ? (a = i, i = e, l = s, s = r) : o ? i += e : i = a + (e - a) / (r - l) * (s - l) } var i = e, a = e, s = Ie(), l = s, n = t || 50, c = Math.max(500, 3 * n); return { update: qd, reset: function reset() { a = i = o ? 0 : i, l = s = 0 }, getVelocity: function getVelocity(e) { var t = l, r = a, n = Ie(); return !e && 0 !== e || e === i || qd(e), s === l || c < n - l ? 0 : (i + (o ? r : -r)) / ((o ? n : s) - t) * 1e3 } } } function M(e, t) { return t && !e._gsapAllow && e.preventDefault(), e.changedTouches ? e.changedTouches[0] : e } function N(e) { var t = Math.max.apply(Math, e), r = Math.min.apply(Math, e); return Math.abs(t) >= Math.abs(r) ? t : r } function O() { (Ae = we.core.globals().ScrollTrigger) && Ae.core && function _integrate() { var e = Ae.core, r = e.bridge || {}, t = e._scrollers, n = e._proxies; t.push.apply(t, ze), n.push.apply(n, qe), ze = t, qe = n, i = function _bridge(e, t) { return r[e](t) } }() } function P(e) { return (we = e || r()) && "undefined" != typeof document && document.body && (Te = window, ke = (Ce = document).documentElement, Ee = Ce.body, t = [Te, Ce, ke, Ee], we.utils.clamp, Le = we.core.context || function () { }, Oe = "onpointerenter" in Ee ? "pointer" : "mouse", Pe = k.isTouch = Te.matchMedia && Te.matchMedia("(hover: none), (pointer: coarse)").matches ? 1 : "ontouchstart" in Te || 0 < navigator.maxTouchPoints || 0 < navigator.msMaxTouchPoints ? 2 : 0, De = k.eventTypes = ("ontouchstart" in ke ? "touchstart,touchmove,touchcancel,touchend" : "onpointerdown" in ke ? "pointerdown,pointermove,pointercancel,pointerup" : "mousedown,mousemove,mouseup,mouseup").split(","), setTimeout(function () { return o = 0 }, 500), O(), Me = 1), Me } var we, Me, Te, Ce, ke, Ee, Pe, Oe, Ae, t, Be, De, Le, o = 1, Fe = [], ze = [], qe = [], Ie = Date.now, i = function _bridge(e, t) { return t }, n = "scrollLeft", a = "scrollTop", Ye = { s: n, p: "left", p2: "Left", os: "right", os2: "Right", d: "width", d2: "Width", a: "x", sc: G(function (e) { return arguments.length ? Te.scrollTo(e, Ne.sc()) : Te.pageXOffset || Ce[n] || ke[n] || Ee[n] || 0 }) }, Ne = { s: a, p: "top", p2: "Top", os: "bottom", os2: "Bottom", d: "height", d2: "Height", a: "y", op: Ye, sc: G(function (e) { return arguments.length ? Te.scrollTo(Ye.sc(), e) : Te.pageYOffset || Ce[a] || ke[a] || Ee[a] || 0 }) }; Ye.op = Ne, ze.cache = 0; var k = (Observer.prototype.init = function init(e) { Me || P(we) || console.warn("Please gsap.registerPlugin(Observer)"), Ae || O(); var o = e.tolerance, a = e.dragMinimum, t = e.type, i = e.target, r = e.lineHeight, n = e.debounce, s = e.preventDefault, l = e.onStop, c = e.onStopDelay, u = e.ignore, f = e.wheelSpeed, p = e.event, d = e.onDragStart, g = e.onDragEnd, h = e.onDrag, v = e.onPress, b = e.onRelease, m = e.onRight, y = e.onLeft, x = e.onUp, w = e.onDown, _ = e.onChangeX, S = e.onChangeY, T = e.onChange, k = e.onToggleX, E = e.onToggleY, D = e.onHover, R = e.onHoverEnd, z = e.onMove, q = e.ignoreCheck, I = e.isNormalizer, X = e.onGestureStart, Y = e.onGestureEnd, V = e.onWheel, U = e.onEnable, j = e.onDisable, H = e.onClick, W = e.scrollSpeed, G = e.capture, Q = e.allowClicks, Z = e.lockAxis, $ = e.onLockAxis; function Re() { return ye = Ie() } function Se(e, t) { return (se.event = e) && u && ~u.indexOf(e.target) || t && ge && "touch" !== e.pointerType || q && q(e, t) } function Ue() { var e = se.deltaX = N(be), t = se.deltaY = N(me), r = Math.abs(e) >= o, n = Math.abs(t) >= o; T && (r || n) && T(se, e, t, be, me), r && (m && 0 < se.deltaX && m(se), y && se.deltaX < 0 && y(se), _ && _(se), k && se.deltaX < 0 != le < 0 && k(se), le = se.deltaX, be[0] = be[1] = be[2] = 0), n && (w && 0 < se.deltaY && w(se), x && se.deltaY < 0 && x(se), S && S(se), E && se.deltaY < 0 != ce < 0 && E(se), ce = se.deltaY, me[0] = me[1] = me[2] = 0), (ne || re) && (z && z(se), re && (h(se), re = !1), ne = !1), ie && !(ie = !1) && $ && $(se), oe && (V(se), oe = !1), ee = 0 } function Ve(e, t, r) { be[r] += e, me[r] += t, se._vx.update(e), se._vy.update(t), n ? ee = ee || requestAnimationFrame(Ue) : Ue() } function We(e, t) { Z && !ae && (se.axis = ae = Math.abs(e) > Math.abs(t) ? "x" : "y", ie = !0), "y" !== ae && (be[2] += e, se._vx.update(e, !0)), "x" !== ae && (me[2] += t, se._vy.update(t, !0)), n ? ee = ee || requestAnimationFrame(Ue) : Ue() } function Xe(e) { if (!Se(e, 1)) { var t = (e = M(e, s)).clientX, r = e.clientY, n = t - se.x, o = r - se.y, i = se.isDragging; se.x = t, se.y = r, (i || Math.abs(se.startX - t) >= a || Math.abs(se.startY - r) >= a) && (h && (re = !0), i || (se.isDragging = !0), We(n, o), i || d && d(se)) } } function Ze(t) { if (!Se(t, 1)) { C(I ? i : ve, De[1], Xe, !0); var e = !isNaN(se.y - se.startY), r = se.isDragging && (3 < Math.abs(se.x - se.startX) || 3 < Math.abs(se.y - se.startY)), n = M(t); !r && e && (se._vx.reset(), se._vy.reset(), s && Q && we.delayedCall(.08, function () { if (300 < Ie() - ye && !t.defaultPrevented) if (t.target.click) t.target.click(); else if (ve.createEvent) { var e = ve.createEvent("MouseEvents"); e.initMouseEvent("click", !0, !0, Te, 1, n.screenX, n.screenY, n.clientX, n.clientY, !1, !1, !1, !1, 0, null), t.target.dispatchEvent(e) } })), se.isDragging = se.isGesturing = se.isPressed = !1, l && !I && te.restart(!0), g && r && g(se), b && b(se, r) } } function $e(e) { return e.touches && 1 < e.touches.length && (se.isGesturing = !0) && X(e, se.isDragging) } function _e() { return (se.isGesturing = !1) || Y(se) } function af(e) { if (!Se(e)) { var t = ue(), r = fe(); Ve((t - pe) * W, (r - de) * W, 1), pe = t, de = r, l && te.restart(!0) } } function bf(e) { if (!Se(e)) { e = M(e, s), V && (oe = !0); var t = (1 === e.deltaMode ? r : 2 === e.deltaMode ? Te.innerHeight : 1) * f; Ve(e.deltaX * t, e.deltaY * t, 0), l && !I && te.restart(!0) } } function cf(e) { if (!Se(e)) { var t = e.clientX, r = e.clientY, n = t - se.x, o = r - se.y; se.x = t, se.y = r, ne = !0, (n || o) && We(n, o) } } function df(e) { se.event = e, D(se) } function ef(e) { se.event = e, R(se) } function ff(e) { return Se(e) || M(e, s) && H(se) } this.target = i = J(i) || ke, this.vars = e, u = u && we.utils.toArray(u), o = o || 1e-9, a = a || 0, f = f || 1, W = W || 1, t = t || "wheel,touch,pointer", n = !1 !== n, r = r || parseFloat(Te.getComputedStyle(Ee).lineHeight) || 22; var ee, te, re, ne, oe, ie, ae, se = this, le = 0, ce = 0, ue = K(i, Ye), fe = K(i, Ne), pe = ue(), de = fe(), ge = ~t.indexOf("touch") && !~t.indexOf("pointer") && "pointerdown" === De[0], he = A(i), ve = i.ownerDocument || Ce, be = [0, 0, 0], me = [0, 0, 0], ye = 0, xe = se.onPress = function (e) { Se(e, 1) || (se.axis = ae = null, te.pause(), se.isPressed = !0, e = M(e), le = ce = 0, se.startX = se.x = e.clientX, se.startY = se.y = e.clientY, se._vx.reset(), se._vy.reset(), B(I ? i : ve, De[1], Xe, s, !0), se.deltaX = se.deltaY = 0, v && v(se)) }; te = se._dc = we.delayedCall(c || .25, function onStopFunc() { se._vx.reset(), se._vy.reset(), te.pause(), l && l(se) }).pause(), se.deltaX = se.deltaY = 0, se._vx = L(0, 50, !0), se._vy = L(0, 50, !0), se.scrollX = ue, se.scrollY = fe, se.isDragging = se.isGesturing = se.isPressed = !1, Le(this), se.enable = function (e) { return se.isEnabled || (B(he ? ve : i, "scroll", F), 0 <= t.indexOf("scroll") && B(he ? ve : i, "scroll", af, s, G), 0 <= t.indexOf("wheel") && B(i, "wheel", bf, s, G), (0 <= t.indexOf("touch") && Pe || 0 <= t.indexOf("pointer")) && (B(i, De[0], xe, s, G), B(ve, De[2], Ze), B(ve, De[3], Ze), Q && B(i, "click", Re, !1, !0), H && B(i, "click", ff), X && B(ve, "gesturestart", $e), Y && B(ve, "gestureend", _e), D && B(i, Oe + "enter", df), R && B(i, Oe + "leave", ef), z && B(i, Oe + "move", cf)), se.isEnabled = !0, e && e.type && xe(e), U && U(se)), se }, se.disable = function () { se.isEnabled && (Fe.filter(function (e) { return e !== se && A(e.target) }).length || C(he ? ve : i, "scroll", F), se.isPressed && (se._vx.reset(), se._vy.reset(), C(I ? i : ve, De[1], Xe, !0)), C(he ? ve : i, "scroll", af, G), C(i, "wheel", bf, G), C(i, De[0], xe, G), C(ve, De[2], Ze), C(ve, De[3], Ze), C(i, "click", Re, !0), C(i, "click", ff), C(ve, "gesturestart", $e), C(ve, "gestureend", _e), C(i, Oe + "enter", df), C(i, Oe + "leave", ef), C(i, Oe + "move", cf), se.isEnabled = se.isPressed = se.isDragging = !1, j && j(se)) }, se.kill = se.revert = function () { se.disable(); var e = Fe.indexOf(se); 0 <= e && Fe.splice(e, 1), Be === se && (Be = 0) }, Fe.push(se), I && A(i) && (Be = se), se.enable(p) }, function _createClass(e, t, r) { return t && _defineProperties(e.prototype, t), r && _defineProperties(e, r), e }(Observer, [{ key: "velocityX", get: function get() { return this._vx.getVelocity() } }, { key: "velocityY", get: function get() { return this._vy.getVelocity() } }]), Observer); function Observer(e) { this.init(e) } k.version = "3.11.5", k.create = function (e) { return new k(e) }, k.register = P, k.getAll = function () { return Fe.slice() }, k.getById = function (t) { return Fe.filter(function (e) { return e.vars.id === t })[0] }, r() && we.registerPlugin(k); function za() { return nt = 1 } function Aa() { return nt = 0 } function Ba(e) { return e } function Ca(e) { return Math.round(1e5 * e) / 1e5 || 0 } function Da() { return "undefined" != typeof window } function Ea() { return Je || Da() && (Je = window.gsap) && Je.registerPlugin && Je } function Fa(e) { return !!~l.indexOf(e) } function Ga(e) { return z(e, "getBoundingClientRect") || (Fa(e) ? function () { return Ft.width = je.innerWidth, Ft.height = je.innerHeight, Ft } : function () { return kt(e) }) } function Ja(e, t) { var r = t.s, n = t.d2, o = t.d, i = t.a; return (r = "scroll" + n) && (i = z(e, r)) ? i() - Ga(e)()[o] : Fa(e) ? (Ke[r] || Ge[r]) - (je["inner" + n] || Ke["client" + n] || Ge["client" + n]) : e[r] - e["offset" + n] } function Ka(e, t) { for (var r = 0; r < g.length; r += 3)t && !~t.indexOf(g[r + 1]) || e(g[r], g[r + 1], g[r + 2]) } function La(e) { return "string" == typeof e } function Ma(e) { return "function" == typeof e } function Na(e) { return "number" == typeof e } function Oa(e) { return "object" == typeof e } function Pa(e, t, r) { return e && e.progress(t ? 0 : 1) && r && e.pause() } function Qa(e, t) { if (e.enabled) { var r = t(e); r && r.totalTime && (e.callbackAnimation = r) } } function fb(e) { return je.getComputedStyle(e) } function hb(e, t) { for (var r in t) r in e || (e[r] = t[r]); return e } function jb(e, t) { var r = t.d2; return e["offset" + r] || e["client" + r] || 0 } function kb(e) { var t, r = [], n = e.labels, o = e.duration(); for (t in n) r.push(n[t] / o); return r } function mb(o) { var i = Je.utils.snap(o), a = Array.isArray(o) && o.slice(0).sort(function (e, t) { return e - t }); return a ? function (e, t, r) { var n; if (void 0 === r && (r = .001), !t) return i(e); if (0 < t) { for (e -= r, n = 0; n < a.length; n++)if (a[n] >= e) return a[n]; return a[n - 1] } for (n = a.length, e += r; n--;)if (a[n] <= e) return a[n]; return a[0] } : function (e, t, r) { void 0 === r && (r = .001); var n = i(e); return !t || Math.abs(n - e) < r || n - e < 0 == t < 0 ? n : i(t < 0 ? e - o : e + o) } } function ob(t, r, e, n) { return e.split(",").forEach(function (e) { return t(r, e, n) }) } function pb(e, t, r, n, o) { return e.addEventListener(t, r, { passive: !n, capture: !!o }) } function qb(e, t, r, n) { return e.removeEventListener(t, r, !!n) } function rb(e, t, r) { return r && r.wheelHandler && e(t, "wheel", r) } function vb(e, t) { if (La(e)) { var r = e.indexOf("="), n = ~r ? (e.charAt(r - 1) + 1) * parseFloat(e.substr(r + 1)) : 0; ~r && (e.indexOf("%") > r && (n *= t / 100), e = e.substr(0, r - 1)), e = n + (e in R ? R[e] * t : ~e.indexOf("%") ? parseFloat(e) * t / 100 : parseFloat(e) || 0) } return e } function wb(e, t, r, n, o, i, a, s) { var l = o.startColor, c = o.endColor, u = o.fontSize, f = o.indent, p = o.fontWeight, d = He.createElement("div"), g = Fa(r) || "fixed" === z(r, "pinType"), h = -1 !== e.indexOf("scroller"), v = g ? Ge : r, b = -1 !== e.indexOf("start"), m = b ? l : c, y = "border-color:" + m + ";font-size:" + u + ";color:" + m + ";font-weight:" + p + ";pointer-events:none;white-space:nowrap;font-family:sans-serif,Arial;z-index:1000;padding:4px 8px;border-width:0;border-style:solid;"; return y += "position:" + ((h || s) && g ? "fixed;" : "absolute;"), !h && !s && g || (y += (n === Ne ? S : T) + ":" + (i + parseFloat(f)) + "px;"), a && (y += "box-sizing:border-box;text-align:left;width:" + a.offsetWidth + "px;"), d._isStart = b, d.setAttribute("class", "gsap-marker-" + e + (t ? " marker-" + t : "")), d.style.cssText = y, d.innerText = t || 0 === t ? e + "-" + t : e, v.children[0] ? v.insertBefore(d, v.children[0]) : v.appendChild(d), d._offset = d["offset" + n.op.d2], q(d, 0, n, b), d } function Bb() { return 34 < dt() - gt && (w = w || requestAnimationFrame(j)) } function Cb() { v && v.isPressed && !(v.startX > Ge.clientWidth) || (ze.cache++, v ? w = w || requestAnimationFrame(j) : j(), gt || Y("scrollStart"), gt = dt()) } function Db() { y = je.innerWidth, m = je.innerHeight } function Eb() { ze.cache++, rt || h || He.fullscreenElement || He.webkitFullscreenElement || b && y === je.innerWidth && !(Math.abs(je.innerHeight - m) > .25 * je.innerHeight) || c.restart(!0) } function Hb() { return qb($, "scrollEnd", Hb) || Dt(!0) } function Kb(e) { for (var t = 0; t < V.length; t += 5)(!e || V[t + 4] && V[t + 4].query === e) && (V[t].style.cssText = V[t + 1], V[t].getBBox && V[t].setAttribute("transform", V[t + 2] || ""), V[t + 3].uncache = 1) } function Lb(e, t) { var r; for (ot = 0; ot < Ot.length; ot++)!(r = Ot[ot]) || t && r._ctx !== t || (e ? r.kill(1) : r.revert(!0, !0)); t && Kb(t), t || Y("revert") } function Mb(e, t) { ze.cache++, !t && ct || ze.forEach(function (e) { return Ma(e) && e.cacheID++ && (e.rec = 0) }), La(e) && (je.history.scrollRestoration = x = e) } function Zb(e, t, r, n) { if (!e._gsap.swappedIn) { for (var o, i = H.length, a = t.style, s = e.style; i--;)a[o = H[i]] = r[o]; a.position = "absolute" === r.position ? "absolute" : "relative", "inline" === r.display && (a.display = "inline-block"), s[T] = s[S] = "auto", a.flexBasis = r.flexBasis || "auto", a.overflow = "visible", a.boxSizing = "border-box", a[bt] = jb(e, Ye) + Ct, a[mt] = jb(e, Ne) + Ct, a[St] = s[Mt] = s.top = s.left = "0", Rt(n), s[bt] = s.maxWidth = r[bt], s[mt] = s.maxHeight = r[mt], s[St] = r[St], e.parentNode !== t && (e.parentNode.insertBefore(t, e), t.appendChild(e)), e._gsap.swappedIn = !0 } } function ac(e) { for (var t = W.length, r = e.style, n = [], o = 0; o < t; o++)n.push(W[o], r[W[o]]); return n.t = e, n } function dc(e, t, r, n, o, i, a, s, l, c, u, f, p) { Ma(e) && (e = e(s)), La(e) && "max" === e.substr(0, 3) && (e = f + ("=" === e.charAt(4) ? vb("0" + e.substr(3), r) : 0)); var d, g, h, v = p ? p.time() : 0; if (p && p.seek(0), Na(e)) a && q(a, r, n, !0); else { Ma(t) && (t = t(s)); var b, m, y, x, w = (e || "0").split(" "); h = J(t) || Ge, (b = kt(h) || {}) && (b.left || b.top) || "none" !== fb(h).display || (x = h.style.display, h.style.display = "block", b = kt(h), x ? h.style.display = x : h.style.removeProperty("display")), m = vb(w[0], b[n.d]), y = vb(w[1] || "0", r), e = b[n.p] - l[n.p] - c + m + o - y, a && q(a, y, n, r - y < 20 || a._isStart && 20 < y), r -= r - y } if (i) { var _ = e + r, S = i._isStart; d = "scroll" + n.d2, q(i, _, n, S && 20 < _ || !S && (u ? Math.max(Ge[d], Ke[d]) : i.parentNode[d]) <= _ + 1), u && (l = kt(a), u && (i.style[n.op.p] = l[n.op.p] - n.op.m - i._offset + Ct)) } return p && h && (d = kt(h), p.seek(f), g = kt(h), p._caScrollDist = d[n.p] - g[n.p], e = e / p._caScrollDist * f), p && p.seek(v), p ? e : Math.round(e) } function fc(e, t, r, n) { if (e.parentNode !== t) { var o, i, a = e.style; if (t === Ge) { for (o in e._stOrig = a.cssText, i = fb(e)) +o || Z.test(o) || !i[o] || "string" != typeof a[o] || "0" === o || (a[o] = i[o]); a.top = r, a.left = n } else a.cssText = e._stOrig; Je.core.getCache(e).uncache = 1, t.appendChild(e) } } function gc(l, e) { function Vj(e, t, r, n, o) { var i = Vj.tween, a = t.onComplete, s = {}; return r = r || f(), o = n && o || 0, n = n || e - r, i && i.kill(), c = Math.round(r), t[p] = e, (t.modifiers = s)[p] = function (e) { return (e = Math.round(f())) !== c && e !== u && 3 < Math.abs(e - c) && 3 < Math.abs(e - u) ? (i.kill(), Vj.tween = 0) : e = r + n * i.ratio + o * i.ratio * i.ratio, u = c, c = Math.round(e) }, t.onUpdate = function () { ze.cache++, j() }, t.onComplete = function () { Vj.tween = 0, a && a.call(i) }, i = Vj.tween = Je.to(l, t) } var c, u, f = K(l, e), p = "_scroll" + e.p2; return (l[p] = f).wheelHandler = function () { return Vj.tween && Vj.tween.kill() && (Vj.tween = 0) }, pb(l, "wheel", f.wheelHandler), Vj } var Je, s, je, He, Ke, Ge, l, c, Qe, et, tt, u, rt, nt, f, ot, p, d, g, it, at, h, v, b, m, y, E, st, x, lt, w, ct, ut, ft, pt = 1, dt = Date.now, _ = dt(), gt = 0, ht = 0, vt = Math.abs, S = "right", T = "bottom", bt = "width", mt = "height", yt = "Right", xt = "Left", wt = "Top", _t = "Bottom", St = "padding", Mt = "margin", Tt = "Width", D = "Height", Ct = "px", kt = function _getBounds(e, t) { var r = t && "matrix(1, 0, 0, 1, 0, 0)" !== fb(e)[f] && Je.to(e, { x: 0, y: 0, xPercent: 0, yPercent: 0, rotation: 0, rotationX: 0, rotationY: 0, scale: 1, skewX: 0, skewY: 0 }).progress(1), n = e.getBoundingClientRect(); return r && r.progress(0).kill(), n }, Et = { startColor: "green", endColor: "red", indent: 0, fontSize: "16px", fontWeight: "normal" }, Pt = { toggleActions: "play", anticipatePin: 0 }, R = { top: 0, left: 0, center: .5, bottom: 1, right: 1 }, q = function _positionMarker(e, t, r, n) { var o = { display: "block" }, i = r[n ? "os2" : "p2"], a = r[n ? "p2" : "os2"]; e._isFlipped = n, o[r.a + "Percent"] = n ? -100 : 0, o[r.a] = n ? "1px" : 0, o["border" + i + Tt] = 1, o["border" + a + Tt] = 0, o[r.p] = t + "px", Je.set(e, o) }, Ot = [], At = {}, I = {}, X = [], Y = function _dispatch(e) { return I[e] && I[e].map(function (e) { return e() }) || X }, V = [], Bt = 0, Dt = function _refreshAll(e, t) { if (!gt || e) { ct = $.isRefreshing = !0, ze.forEach(function (e) { return Ma(e) && e.cacheID++ && (e.rec = e()) }); var r = Y("refreshInit"); it && $.sort(), t || Lb(), ze.forEach(function (e) { Ma(e) && (e.smooth && (e.target.style.scrollBehavior = "auto"), e(0)) }), Ot.slice(0).forEach(function (e) { return e.refresh() }), Ot.forEach(function (e, t) { if (e._subPinOffset && e.pin) { var r = e.vars.horizontal ? "offsetWidth" : "offsetHeight", n = e.pin[r]; e.revert(!0, 1), e.adjustPinSpacing(e.pin[r] - n), e.revert(!1, 1) } }), Ot.forEach(function (e) { return "max" === e.vars.end && e.setPositions(e.start, Math.max(e.start + 1, Ja(e.scroller, e._dir))) }), r.forEach(function (e) { return e && e.render && e.render(-1) }), ze.forEach(function (e) { Ma(e) && (e.smooth && requestAnimationFrame(function () { return e.target.style.scrollBehavior = "smooth" }), e.rec && e(e.rec)) }), Mb(x, 1), c.pause(), Bt++, j(2), Ot.forEach(function (e) { return Ma(e.vars.onRefresh) && e.vars.onRefresh(e) }), ct = $.isRefreshing = !1, Y("refresh") } else pb($, "scrollEnd", Hb) }, U = 0, Lt = 1, j = function _updateAll(e) { if (!ct || 2 === e) { $.isUpdating = !0, ft && ft.update(0); var t = Ot.length, r = dt(), n = 50 <= r - _, o = t && Ot[0].scroll(); if (Lt = o < U ? -1 : 1, U = o, n && (gt && !nt && 200 < r - gt && (gt = 0, Y("scrollEnd")), tt = _, _ = r), Lt < 0) { for (ot = t; 0 < ot--;)Ot[ot] && Ot[ot].update(0, n); Lt = 1 } else for (ot = 0; ot < t; ot++)Ot[ot] && Ot[ot].update(0, n); $.isUpdating = !1 } w = 0 }, H = ["left", "top", T, S, Mt + _t, Mt + yt, Mt + wt, Mt + xt, "display", "flexShrink", "float", "zIndex", "gridColumnStart", "gridColumnEnd", "gridRowStart", "gridRowEnd", "gridArea", "justifySelf", "alignSelf", "placeSelf", "order"], W = H.concat([bt, mt, "boxSizing", "max" + Tt, "max" + D, "position", Mt, St, St + wt, St + yt, St + _t, St + xt]), Q = /([A-Z])/g, Rt = function _setState(e) { if (e) { var t, r, n = e.t.style, o = e.length, i = 0; for ((e.t._gsap || Je.core.getCache(e.t)).uncache = 1; i < o; i += 2)r = e[i + 1], t = e[i], r ? n[t] = r : n[t] && n.removeProperty(t.replace(Q, "-$1").toLowerCase()) } }, Ft = { left: 0, top: 0 }, Z = /(webkit|moz|length|cssText|inset)/i, $ = (ScrollTrigger.prototype.init = function init(M, T) { if (this.progress = this.start = 0, this.vars && this.kill(!0, !0), ht) { var C, n, d, k, E, P, O, A, B, D, L, e, R, F, q, I, X, t, Y, b, N, V, m, U, y, j, x, r, w, _, H, o, g, W, G, Q, Z, S, i, $ = (M = hb(La(M) || Na(M) || M.nodeType ? { trigger: M } : M, Pt)).onUpdate, ee = M.toggleClass, a = M.id, te = M.onToggle, re = M.onRefresh, ne = M.scrub, oe = M.trigger, ie = M.pin, ae = M.pinSpacing, se = M.invalidateOnRefresh, le = M.anticipatePin, s = M.onScrubComplete, h = M.onSnapComplete, ce = M.once, ue = M.snap, fe = M.pinReparent, l = M.pinSpacer, pe = M.containerAnimation, de = M.fastScrollEnd, ge = M.preventOverlaps, he = M.horizontal || M.containerAnimation && !1 !== M.horizontal ? Ye : Ne, ve = !ne && 0 !== ne, be = J(M.scroller || je), c = Je.core.getCache(be), me = Fa(be), ye = "fixed" === ("pinType" in M ? M.pinType : z(be, "pinType") || me && "fixed"), xe = [M.onEnter, M.onLeave, M.onEnterBack, M.onLeaveBack], we = ve && M.toggleActions.split(" "), u = "markers" in M ? M.markers : Pt.markers, _e = me ? 0 : parseFloat(fb(be)["border" + he.p2 + Tt]) || 0, Se = this, Me = M.onRefreshInit && function () { return M.onRefreshInit(Se) }, Te = function _getSizeFunc(e, t, r) { var n = r.d, o = r.d2, i = r.a; return (i = z(e, "getBoundingClientRect")) ? function () { return i()[n] } : function () { return (t ? je["inner" + o] : e["client" + o]) || 0 } }(be, me, he), Ce = function _getOffsetsFunc(e, t) { return !t || ~qe.indexOf(e) ? Ga(e) : function () { return Ft } }(be, me), ke = 0, Ee = 0, Pe = K(be, he); if (st(Se), Se._dir = he, le *= 45, Se.scroller = be, Se.scroll = pe ? pe.time.bind(pe) : Pe, k = Pe(), Se.vars = M, T = T || M.animation, "refreshPriority" in M && (it = 1, -9999 === M.refreshPriority && (ft = Se)), c.tweenScroll = c.tweenScroll || { top: gc(be, Ne), left: gc(be, Ye) }, Se.tweenTo = C = c.tweenScroll[he.p], Se.scrubDuration = function (e) { (o = Na(e) && e) ? H ? H.duration(e) : H = Je.to(T, { ease: "expo", totalProgress: "+=0.001", duration: o, paused: !0, onComplete: function onComplete() { return s && s(Se) } }) : (H && H.progress(1).kill(), H = 0) }, T && (T.vars.lazy = !1, T._initted || !1 !== T.vars.immediateRender && !1 !== M.immediateRender && T.duration() && T.render(0, !0, !0), Se.animation = T.pause(), (T.scrollTrigger = Se).scrubDuration(ne), H && H.resetTo && H.resetTo("totalProgress", 0), w = 0, a = a || T.vars.id), Ot.push(Se), ue && (Oa(ue) && !ue.push || (ue = { snapTo: ue }), "scrollBehavior" in Ge.style && Je.set(me ? [Ge, Ke] : be, { scrollBehavior: "auto" }), ze.forEach(function (e) { return Ma(e) && e.target === (me ? He.scrollingElement || Ke : be) && (e.smooth = !1) }), d = Ma(ue.snapTo) ? ue.snapTo : "labels" === ue.snapTo ? function _getClosestLabel(t) { return function (e) { return Je.utils.snap(kb(t), e) } }(T) : "labelsDirectional" === ue.snapTo ? function _getLabelAtDirection(r) { return function (e, t) { return mb(kb(r))(e, t.direction) } }(T) : !1 !== ue.directional ? function (e, t) { return mb(ue.snapTo)(e, dt() - Ee < 500 ? 0 : t.direction) } : Je.utils.snap(ue.snapTo), g = ue.duration || { min: .1, max: 2 }, g = Oa(g) ? et(g.min, g.max) : et(g, g), W = Je.delayedCall(ue.delay || o / 2 || .1, function () { var e = Pe(), t = dt() - Ee < 500, r = C.tween; if (!(t || Math.abs(Se.getVelocity()) < 10) || r || nt || ke === e) Se.isActive && ke !== e && W.restart(!0); else { var n = (e - P) / R, o = T && !ve ? T.totalProgress() : n, i = t ? 0 : (o - _) / (dt() - tt) * 1e3 || 0, a = Je.utils.clamp(-n, 1 - n, vt(i / 2) * i / .185), s = n + (!1 === ue.inertia ? 0 : a), l = et(0, 1, d(s, Se)), c = Math.round(P + l * R), u = ue.onStart, f = ue.onInterrupt, p = ue.onComplete; if (e <= O && P <= e && c !== e) { if (r && !r._initted && r.data <= vt(c - e)) return; !1 === ue.inertia && (a = l - n), C(c, { duration: g(vt(.185 * Math.max(vt(s - o), vt(l - o)) / i / .05 || 0)), ease: ue.ease || "power3", data: vt(c - e), onInterrupt: function onInterrupt() { return W.restart(!0) && f && f(Se) }, onComplete: function onComplete() { Se.update(), ke = Pe(), w = _ = T && !ve ? T.totalProgress() : Se.progress, h && h(Se), p && p(Se) } }, e, a * R, c - e - a * R), u && u(Se, C.tween) } } }).pause()), a && (At[a] = Se), i = (i = (oe = Se.trigger = J(oe || ie)) && oe._gsap && oe._gsap.stRevert) && i(Se), ie = !0 === ie ? oe : J(ie), La(ee) && (ee = { targets: oe, className: ee }), ie && (!1 === ae || ae === Mt || (ae = !(!ae && ie.parentNode && ie.parentNode.style && "flex" === fb(ie.parentNode).display) && St), Se.pin = ie, (n = Je.core.getCache(ie)).spacer ? F = n.pinState : (l && ((l = J(l)) && !l.nodeType && (l = l.current || l.nativeElement), n.spacerIsNative = !!l, l && (n.spacerState = ac(l))), n.spacer = X = l || He.createElement("div"), X.classList.add("pin-spacer"), a && X.classList.add("pin-spacer-" + a), n.pinState = F = ac(ie)), !1 !== M.force3D && Je.set(ie, { force3D: !0 }), Se.spacer = X = n.spacer, r = fb(ie), m = r[ae + he.os2], Y = Je.getProperty(ie), b = Je.quickSetter(ie, he.a, Ct), Zb(ie, X, r), I = ac(ie)), u) { e = Oa(u) ? hb(u, Et) : Et, D = wb("scroller-start", a, be, he, e, 0), L = wb("scroller-end", a, be, he, e, 0, D), t = D["offset" + he.op.d2]; var f = J(z(be, "content") || be); A = this.markerStart = wb("start", a, f, he, e, t, 0, pe), B = this.markerEnd = wb("end", a, f, he, e, t, 0, pe), pe && (S = Je.quickSetter([A, B], he.a, Ct)), ye || qe.length && !0 === z(be, "fixedMarkers") || (function _makePositionable(e) { var t = fb(e).position; e.style.position = "absolute" === t || "fixed" === t ? t : "relative" }(me ? Ge : be), Je.set([D, L], { force3D: !0 }), y = Je.quickSetter(D, he.a, Ct), x = Je.quickSetter(L, he.a, Ct)) } if (pe) { var p = pe.vars.onUpdate, v = pe.vars.onUpdateParams; pe.eventCallback("onUpdate", function () { Se.update(0, 0, 1), p && p.apply(pe, v || []) }) } Se.previous = function () { return Ot[Ot.indexOf(Se) - 1] }, Se.next = function () { return Ot[Ot.indexOf(Se) + 1] }, Se.revert = function (e, t) { if (!t) return Se.kill(!0); var r = !1 !== e || !Se.enabled, n = rt; r !== Se.isReverted && (r && (Q = Math.max(Pe(), Se.scroll.rec || 0), G = Se.progress, Z = T && T.progress()), A && [A, B, D, L].forEach(function (e) { return e.style.display = r ? "none" : "block" }), r && (rt = 1, Se.update(r)), !ie || fe && Se.isActive || (r ? function _swapPinOut(e, t, r) { Rt(r); var n = e._gsap; if (n.spacerIsNative) Rt(n.spacerState); else if (e._gsap.swappedIn) { var o = t.parentNode; o && (o.insertBefore(e, t), o.removeChild(t)) } e._gsap.swappedIn = !1 }(ie, X, F) : Zb(ie, X, fb(ie), U)), r || Se.update(r), rt = n, Se.isReverted = r) }, Se.refresh = function (e, t) { if (!rt && Se.enabled || t) if (ie && e && gt) pb(ScrollTrigger, "scrollEnd", Hb); else { !ct && Me && Me(Se), rt = 1, Ee = dt(), C.tween && (C.tween.kill(), C.tween = 0), H && H.pause(), se && T && T.revert({ kill: !1 }).invalidate(), Se.isReverted || Se.revert(!0, !0), Se._subPinOffset = !1; for (var r, n, o, i, a, s, l, c, u, f, p, d = Te(), g = Ce(), h = pe ? pe.duration() : Ja(be, he), v = 0, b = 0, m = M.end, y = M.endTrigger || oe, x = M.start || (0 !== M.start && oe ? ie ? "0 0" : "0 100%" : 0), w = Se.pinnedContainer = M.pinnedContainer && J(M.pinnedContainer), _ = oe && Math.max(0, Ot.indexOf(Se)) || 0, S = _; S--;)(s = Ot[S]).end || s.refresh(0, 1) || (rt = 1), !(l = s.pin) || l !== oe && l !== ie || s.isReverted || ((f = f || []).unshift(s), s.revert(!0, !0)), s !== Ot[S] && (_--, S--); for (Ma(x) && (x = x(Se)), P = dc(x, oe, d, he, Pe(), A, D, Se, g, _e, ye, h, pe) || (ie ? -.001 : 0), Ma(m) && (m = m(Se)), La(m) && !m.indexOf("+=") && (~m.indexOf(" ") ? m = (La(x) ? x.split(" ")[0] : "") + m : (v = vb(m.substr(2), d), m = La(x) ? x : P + v, y = oe)), O = Math.max(P, dc(m || (y ? "100% 0" : h), y, d, he, Pe() + v, B, L, Se, g, _e, ye, h, pe)) || -.001, R = O - P || (P -= .01) && .001, v = 0, S = _; S--;)(l = (s = Ot[S]).pin) && s.start - s._pinPush <= P && !pe && 0 < s.end && (r = s.end - s.start, (l === oe && s.start - s._pinPush < P || l === w) && !Na(x) && (v += r * (1 - s.progress)), l === ie && (b += r)); if (P += v, O += v, Se._pinPush = b, A && v && ((r = {})[he.a] = "+=" + v, w && (r[he.p] = "-=" + Pe()), Je.set([A, B], r)), ie) r = fb(ie), i = he === Ne, o = Pe(), N = parseFloat(Y(he.a)) + b, !h && 1 < O && ((p = { style: p = (me ? He.scrollingElement || Ke : be).style, value: p["overflow" + he.a.toUpperCase()] })["overflow" + he.a.toUpperCase()] = "scroll"), Zb(ie, X, r), I = ac(ie), n = kt(ie, !0), c = ye && K(be, i ? Ye : Ne)(), ae && ((U = [ae + he.os2, R + b + Ct]).t = X, (S = ae === St ? jb(ie, he) + R + b : 0) && U.push(he.d, S + Ct), Rt(U), w && Ot.forEach(function (e) { e.pin === w && !1 !== e.vars.pinSpacing && (e._subPinOffset = !0) }), ye && Pe(Q)), ye && ((a = { top: n.top + (i ? o - P : c) + Ct, left: n.left + (i ? c : o - P) + Ct, boxSizing: "border-box", position: "fixed" })[bt] = a.maxWidth = Math.ceil(n.width) + Ct, a[mt] = a.maxHeight = Math.ceil(n.height) + Ct, a[Mt] = a[Mt + wt] = a[Mt + yt] = a[Mt + _t] = a[Mt + xt] = "0", a[St] = r[St], a[St + wt] = r[St + wt], a[St + yt] = r[St + yt], a[St + _t] = r[St + _t], a[St + xt] = r[St + xt], q = function _copyState(e, t, r) { for (var n, o = [], i = e.length, a = r ? 8 : 0; a < i; a += 2)n = e[a], o.push(n, n in t ? t[n] : e[a + 1]); return o.t = e.t, o }(F, a, fe), ct && Pe(0)), T ? (u = T._initted, at(1), T.render(T.duration(), !0, !0), V = Y(he.a) - N + R + b, j = 1 < Math.abs(R - V), ye && j && q.splice(q.length - 2, 2), T.render(0, !0, !0), u || T.invalidate(!0), T.parent || T.totalTime(T.totalTime()), at(0)) : V = R, p && (p.value ? p.style["overflow" + he.a.toUpperCase()] = p.value : p.style.removeProperty("overflow-" + he.a)); else if (oe && Pe() && !pe) for (n = oe.parentNode; n && n !== Ge;)n._pinOffset && (P -= n._pinOffset, O -= n._pinOffset), n = n.parentNode; f && f.forEach(function (e) { return e.revert(!1, !0) }), Se.start = P, Se.end = O, k = E = ct ? Q : Pe(), pe || ct || (k < Q && Pe(Q), Se.scroll.rec = 0), Se.revert(!1, !0), W && (ke = -1, Se.isActive && Pe(P + R * G), W.restart(!0)), rt = 0, T && ve && (T._initted || Z) && T.progress() !== Z && T.progress(Z, !0).render(T.time(), !0, !0), G === Se.progress && !pe || (T && !ve && T.totalProgress(pe && P < -.001 ? Je.utils.mapRange(P, O, 0, 1, G) : G, !0), Se.progress = (k - P) / R === G ? 0 : G), ie && ae && (X._pinOffset = Math.round(Se.progress * V)), re && !ct && re(Se) } }, Se.getVelocity = function () { return (Pe() - E) / (dt() - tt) * 1e3 || 0 }, Se.endAnimation = function () { Pa(Se.callbackAnimation), T && (H ? H.progress(1) : T.paused() ? ve || Pa(T, Se.direction < 0, 1) : Pa(T, T.reversed())) }, Se.labelToScroll = function (e) { return T && T.labels && (P || Se.refresh() || P) + T.labels[e] / T.duration() * R || 0 }, Se.getTrailing = function (t) { var e = Ot.indexOf(Se), r = 0 < Se.direction ? Ot.slice(0, e).reverse() : Ot.slice(e + 1); return (La(t) ? r.filter(function (e) { return e.vars.preventOverlaps === t }) : r).filter(function (e) { return 0 < Se.direction ? e.end <= P : e.start >= O }) }, Se.update = function (e, t, r) { if (!pe || r || e) { var n, o, i, a, s, l, c, u = ct ? Q : Se.scroll(), f = e ? 0 : (u - P) / R, p = f < 0 ? 0 : 1 < f ? 1 : f || 0, d = Se.progress; if (t && (E = k, k = pe ? Pe() : u, ue && (_ = w, w = T && !ve ? T.totalProgress() : p)), le && !p && ie && !rt && !pt && gt && P < u + (u - E) / (dt() - tt) * le && (p = 1e-4), p !== d && Se.enabled) { if (a = (s = (n = Se.isActive = !!p && p < 1) != (!!d && d < 1)) || !!p != !!d, Se.direction = d < p ? 1 : -1, Se.progress = p, a && !rt && (o = p && !d ? 0 : 1 === p ? 1 : 1 === d ? 2 : 3, ve && (i = !s && "none" !== we[o + 1] && we[o + 1] || we[o], c = T && ("complete" === i || "reset" === i || i in T))), ge && (s || c) && (c || ne || !T) && (Ma(ge) ? ge(Se) : Se.getTrailing(ge).forEach(function (e) { return e.endAnimation() })), ve || (!H || rt || pt ? T && T.totalProgress(p, !!rt) : (H._dp._time - H._start !== H._time && H.render(H._dp._time - H._start), H.resetTo ? H.resetTo("totalProgress", p, T._tTime / T._tDur) : (H.vars.totalProgress = p, H.invalidate().restart()))), ie) if (e && ae && (X.style[ae + he.os2] = m), ye) { if (a) { if (l = !e && d < p && u < O + 1 && u + 1 >= Ja(be, he), fe) if (e || !n && !l) fc(ie, X); else { var g = kt(ie, !0), h = u - P; fc(ie, Ge, g.top + (he === Ne ? h : 0) + Ct, g.left + (he === Ne ? 0 : h) + Ct) } Rt(n || l ? q : I), j && p < 1 && n || b(N + (1 !== p || l ? 0 : V)) } } else b(Ca(N + V * p)); !ue || C.tween || rt || pt || W.restart(!0), ee && (s || ce && p && (p < 1 || !lt)) && Qe(ee.targets).forEach(function (e) { return e.classList[n || ce ? "add" : "remove"](ee.className) }), !$ || ve || e || $(Se), a && !rt ? (ve && (c && ("complete" === i ? T.pause().totalProgress(1) : "reset" === i ? T.restart(!0).pause() : "restart" === i ? T.restart(!0) : T[i]()), $ && $(Se)), !s && lt || (te && s && Qa(Se, te), xe[o] && Qa(Se, xe[o]), ce && (1 === p ? Se.kill(!1, 1) : xe[o] = 0), s || xe[o = 1 === p ? 1 : 3] && Qa(Se, xe[o])), de && !n && Math.abs(Se.getVelocity()) > (Na(de) ? de : 2500) && (Pa(Se.callbackAnimation), H ? H.progress(1) : Pa(T, "reverse" === i ? 1 : !p, 1))) : ve && $ && !rt && $(Se) } if (x) { var v = pe ? u / pe.duration() * (pe._caScrollDist || 0) : u; y(v + (D._isFlipped ? 1 : 0)), x(v) } S && S(-u / pe.duration() * (pe._caScrollDist || 0)) } }, Se.enable = function (e, t) { Se.enabled || (Se.enabled = !0, pb(be, "resize", Eb), pb(me ? He : be, "scroll", Cb), Me && pb(ScrollTrigger, "refreshInit", Me), !1 !== e && (Se.progress = G = 0, k = E = ke = Pe()), !1 !== t && Se.refresh()) }, Se.getTween = function (e) { return e && C ? C.tween : H }, Se.setPositions = function (e, t) { ie && (N += e - P, V += t - e - R, ae === St && Se.adjustPinSpacing(t - e - R)), Se.start = P = e, Se.end = O = t, R = t - e, Se.update() }, Se.adjustPinSpacing = function (e) { if (U) { var t = U.indexOf(he.d) + 1; U[t] = parseFloat(U[t]) + e + Ct, U[1] = parseFloat(U[1]) + e + Ct, Rt(U) } }, Se.disable = function (e, t) { if (Se.enabled && (!1 !== e && Se.revert(!0, !0), Se.enabled = Se.isActive = !1, t || H && H.pause(), Q = 0, n && (n.uncache = 1), Me && qb(ScrollTrigger, "refreshInit", Me), W && (W.pause(), C.tween && C.tween.kill() && (C.tween = 0)), !me)) { for (var r = Ot.length; r--;)if (Ot[r].scroller === be && Ot[r] !== Se) return; qb(be, "resize", Eb), qb(be, "scroll", Cb) } }, Se.kill = function (e, t) { Se.disable(e, t), H && !t && H.kill(), a && delete At[a]; var r = Ot.indexOf(Se); 0 <= r && Ot.splice(r, 1), r === ot && 0 < Lt && ot--, r = 0, Ot.forEach(function (e) { return e.scroller === Se.scroller && (r = 1) }), r || ct || (Se.scroll.rec = 0), T && (T.scrollTrigger = null, e && T.revert({ kill: !1 }), t || T.kill()), A && [A, B, D, L].forEach(function (e) { return e.parentNode && e.parentNode.removeChild(e) }), ft === Se && (ft = 0), ie && (n && (n.uncache = 1), r = 0, Ot.forEach(function (e) { return e.pin === ie && r++ }), r || (n.spacer = 0)), M.onKill && M.onKill(Se) }, Se.enable(!1, !1), i && i(Se), T && T.add && !R ? Je.delayedCall(.01, function () { return P || O || Se.refresh() }) && (R = .01) && (P = O = 0) : Se.refresh(), ie && function _queueRefreshAll() { if (ut !== Bt) { var e = ut = Bt; requestAnimationFrame(function () { return e === Bt && Dt(!0) }) } }() } else this.update = this.refresh = this.kill = Ba }, ScrollTrigger.register = function register(e) { return s || (Je = e || Ea(), Da() && window.document && ScrollTrigger.enable(), s = ht), s }, ScrollTrigger.defaults = function defaults(e) { if (e) for (var t in e) Pt[t] = e[t]; return Pt }, ScrollTrigger.disable = function disable(t, r) { ht = 0, Ot.forEach(function (e) { return e[r ? "kill" : "disable"](t) }), qb(je, "wheel", Cb), qb(He, "scroll", Cb), clearInterval(u), qb(He, "touchcancel", Ba), qb(Ge, "touchstart", Ba), ob(qb, He, "pointerdown,touchstart,mousedown", za), ob(qb, He, "pointerup,touchend,mouseup", Aa), c.kill(), Ka(qb); for (var e = 0; e < ze.length; e += 3)rb(qb, ze[e], ze[e + 1]), rb(qb, ze[e], ze[e + 2]) }, ScrollTrigger.enable = function enable() { if (je = window, He = document, Ke = He.documentElement, Ge = He.body, Je && (Qe = Je.utils.toArray, et = Je.utils.clamp, st = Je.core.context || Ba, at = Je.core.suppressOverwrites || Ba, x = je.history.scrollRestoration || "auto", Je.core.globals("ScrollTrigger", ScrollTrigger), Ge)) { ht = 1, function _rafBugFix() { return ht && requestAnimationFrame(_rafBugFix) }(), k.register(Je), ScrollTrigger.isTouch = k.isTouch, E = k.isTouch && /(iPad|iPhone|iPod|Mac)/g.test(navigator.userAgent), pb(je, "wheel", Cb), l = [je, He, Ke, Ge], Je.matchMedia ? (ScrollTrigger.matchMedia = function (e) { var t, r = Je.matchMedia(); for (t in e) r.add(t, e[t]); return r }, Je.addEventListener("matchMediaInit", function () { return Lb() }), Je.addEventListener("matchMediaRevert", function () { return Kb() }), Je.addEventListener("matchMedia", function () { Dt(0, 1), Y("matchMedia") }), Je.matchMedia("(orientation: portrait)", function () { return Db(), Db })) : console.warn("Requires GSAP 3.11.0 or later"), Db(), pb(He, "scroll", Cb); var e, t, r = Ge.style, n = r.borderTopStyle, o = Je.core.Animation.prototype; for (o.revert || Object.defineProperty(o, "revert", { value: function value() { return this.time(-.01, !0) } }), r.borderTopStyle = "solid", e = kt(Ge), Ne.m = Math.round(e.top + Ne.sc()) || 0, Ye.m = Math.round(e.left + Ye.sc()) || 0, n ? r.borderTopStyle = n : r.removeProperty("border-top-style"), u = setInterval(Bb, 250), Je.delayedCall(.5, function () { return pt = 0 }), pb(He, "touchcancel", Ba), pb(Ge, "touchstart", Ba), ob(pb, He, "pointerdown,touchstart,mousedown", za), ob(pb, He, "pointerup,touchend,mouseup", Aa), f = Je.utils.checkPrefix("transform"), W.push(f), s = dt(), c = Je.delayedCall(.2, Dt).pause(), g = [He, "visibilitychange", function () { var e = je.innerWidth, t = je.innerHeight; He.hidden ? (p = e, d = t) : p === e && d === t || Eb() }, He, "DOMContentLoaded", Dt, je, "load", Dt, je, "resize", Eb], Ka(pb), Ot.forEach(function (e) { return e.enable(0, 1) }), t = 0; t < ze.length; t += 3)rb(qb, ze[t], ze[t + 1]), rb(qb, ze[t], ze[t + 2]) } }, ScrollTrigger.config = function config(e) { "limitCallbacks" in e && (lt = !!e.limitCallbacks); var t = e.syncInterval; t && clearInterval(u) || (u = t) && setInterval(Bb, t), "ignoreMobileResize" in e && (b = 1 === ScrollTrigger.isTouch && e.ignoreMobileResize), "autoRefreshEvents" in e && (Ka(qb) || Ka(pb, e.autoRefreshEvents || "none"), h = -1 === (e.autoRefreshEvents + "").indexOf("resize")) }, ScrollTrigger.scrollerProxy = function scrollerProxy(e, t) { var r = J(e), n = ze.indexOf(r), o = Fa(r); ~n && ze.splice(n, o ? 6 : 2), t && (o ? qe.unshift(je, t, Ge, t, Ke, t) : qe.unshift(r, t)) }, ScrollTrigger.clearMatchMedia = function clearMatchMedia(t) { Ot.forEach(function (e) { return e._ctx && e._ctx.query === t && e._ctx.kill(!0, !0) }) }, ScrollTrigger.isInViewport = function isInViewport(e, t, r) { var n = (La(e) ? J(e) : e).getBoundingClientRect(), o = n[r ? bt : mt] * t || 0; return r ? 0 < n.right - o && n.left + o < je.innerWidth : 0 < n.bottom - o && n.top + o < je.innerHeight }, ScrollTrigger.positionInViewport = function positionInViewport(e, t, r) { La(e) && (e = J(e)); var n = e.getBoundingClientRect(), o = n[r ? bt : mt], i = null == t ? o / 2 : t in R ? R[t] * o : ~t.indexOf("%") ? parseFloat(t) * o / 100 : parseFloat(t) || 0; return r ? (n.left + i) / je.innerWidth : (n.top + i) / je.innerHeight }, ScrollTrigger.killAll = function killAll(e) { if (Ot.slice(0).forEach(function (e) { return "ScrollSmoother" !== e.vars.id && e.kill() }), !0 !== e) { var t = I.killAll || []; I = {}, t.forEach(function (e) { return e() }) } }, ScrollTrigger); function ScrollTrigger(e, t) { s || ScrollTrigger.register(Je) || console.warn("Please gsap.registerPlugin(ScrollTrigger)"), this.init(e, t) } $.version = "3.11.5", $.saveStyles = function (e) { return e ? Qe(e).forEach(function (e) { if (e && e.style) { var t = V.indexOf(e); 0 <= t && V.splice(t, 5), V.push(e, e.style.cssText, e.getBBox && e.getAttribute("transform"), Je.core.getCache(e), st()) } }) : V }, $.revert = function (e, t) { return Lb(!e, t) }, $.create = function (e, t) { return new $(e, t) }, $.refresh = function (e) { return e ? Eb() : (s || $.register()) && Dt(!0) }, $.update = function (e) { return ++ze.cache && j(!0 === e ? 2 : 0) }, $.clearScrollMemory = Mb, $.maxScroll = function (e, t) { return Ja(e, t ? Ye : Ne) }, $.getScrollFunc = function (e, t) { return K(J(e), t ? Ye : Ne) }, $.getById = function (e) { return At[e] }, $.getAll = function () { return Ot.filter(function (e) { return "ScrollSmoother" !== e.vars.id }) }, $.isScrolling = function () { return !!gt }, $.snapDirectional = mb, $.addEventListener = function (e, t) { var r = I[e] || (I[e] = []); ~r.indexOf(t) || r.push(t) }, $.removeEventListener = function (e, t) { var r = I[e], n = r && r.indexOf(t); 0 <= n && r.splice(n, 1) }, $.batch = function (e, t) { function Jo(e, t) { var r = [], n = [], o = Je.delayedCall(i, function () { t(r, n), r = [], n = [] }).pause(); return function (e) { r.length || o.restart(!0), r.push(e.trigger), n.push(e), a <= r.length && o.progress(1) } } var r, n = [], o = {}, i = t.interval || .016, a = t.batchMax || 1e9; for (r in t) o[r] = "on" === r.substr(0, 2) && Ma(t[r]) && "onRefreshInit" !== r ? Jo(0, t[r]) : t[r]; return Ma(a) && (a = a(), pb($, "refresh", function () { return a = t.batchMax() })), Qe(e).forEach(function (e) { var t = {}; for (r in o) t[r] = o[r]; t.trigger = e, n.push($.create(t)) }), n }; function ic(e, t, r, n) { return n < t ? e(n) : t < 0 && e(0), n < r ? (n - t) / (r - t) : r < 0 ? t / (t - r) : 1 } function jc(e, t) { !0 === t ? e.style.removeProperty("touch-action") : e.style.touchAction = !0 === t ? "auto" : t ? "pan-" + t + (k.isTouch ? " pinch-zoom" : "") : "none", e === Ke && jc(Ge, t) } function lc(e) { var t, r = e.event, n = e.target, o = e.axis, i = (r.changedTouches ? r.changedTouches[0] : r).target, a = i._gsap || Je.core.getCache(i), s = dt(); if (!a._isScrollT || 2e3 < s - a._isScrollT) { for (; i && i !== Ge && (i.scrollHeight <= i.clientHeight && i.scrollWidth <= i.clientWidth || !te[(t = fb(i)).overflowY] && !te[t.overflowX]);)i = i.parentNode; a._isScroll = i && i !== n && !Fa(i) && (te[(t = fb(i)).overflowY] || te[t.overflowX]), a._isScrollT = s } !a._isScroll && "x" !== o || (r.stopPropagation(), r._gsapAllow = !0) } function mc(e, t, r, n) { return k.create({ target: e, capture: !0, debounce: !1, lockAxis: !0, type: t, onWheel: n = n && lc, onPress: n, onDrag: n, onScroll: n, onEnable: function onEnable() { return r && pb(He, k.eventTypes[0], ne, !1, !0) }, onDisable: function onDisable() { return qb(He, k.eventTypes[0], ne, !0) } }) } function qc(e) { function Gp() { return o = !1 } function Jp() { i = Ja(d, Ne), T = et(E ? 1 : 0, i), f && (M = et(0, Ja(d, Ye))), l = Bt } function Kp() { v._gsap.y = Ca(parseFloat(v._gsap.y) + b.offset) + "px", v.style.transform = "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, " + parseFloat(v._gsap.y) + ", 0, 1)", b.offset = b.cacheID = 0 } function Qp() { Jp(), a.isActive() && a.vars.scrollY > i && (b() > i ? a.progress(1) && b(i) : a.resetTo("scrollY", i)) } Oa(e) || (e = {}), e.preventDefault = e.isNormalizer = e.allowClicks = !0, e.type || (e.type = "wheel,touch"), e.debounce = !!e.debounce, e.id = e.id || "normalizer"; var n, i, l, o, a, c, u, s, f = e.normalizeScrollX, t = e.momentum, r = e.allowNestedScroll, p = e.onRelease, d = J(e.target) || Ke, g = Je.core.globals().ScrollSmoother, h = g && g.get(), v = E && (e.content && J(e.content) || h && !1 !== e.content && !h.smooth() && h.content()), b = K(d, Ne), m = K(d, Ye), y = 1, x = (k.isTouch && je.visualViewport ? je.visualViewport.scale * je.visualViewport.width : je.outerWidth) / je.innerWidth, w = 0, _ = Ma(t) ? function () { return t(n) } : function () { return t || 2.8 }, S = mc(d, e.type, !0, r), M = Ba, T = Ba; return v && Je.set(v, { y: "+=0" }), e.ignoreCheck = function (e) { return E && "touchmove" === e.type && function ignoreDrag() { if (o) { requestAnimationFrame(Gp); var e = Ca(n.deltaY / 2), t = T(b.v - e); if (v && t !== b.v + b.offset) { b.offset = t - b.v; var r = Ca((parseFloat(v && v._gsap.y) || 0) - b.offset); v.style.transform = "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, " + r + ", 0, 1)", v._gsap.y = r + "px", b.cacheID = ze.cache, j() } return !0 } b.offset && Kp(), o = !0 }() || 1.05 < y && "touchstart" !== e.type || n.isGesturing || e.touches && 1 < e.touches.length }, e.onPress = function () { var e = y; y = Ca((je.visualViewport && je.visualViewport.scale || 1) / x), a.pause(), e !== y && jc(d, 1.01 < y || !f && "x"), c = m(), u = b(), Jp(), l = Bt }, e.onRelease = e.onGestureStart = function (e, t) { if (b.offset && Kp(), t) { ze.cache++; var r, n, o = _(); f && (n = (r = m()) + .05 * o * -e.velocityX / .227, o *= ic(m, r, n, Ja(d, Ye)), a.vars.scrollX = M(n)), n = (r = b()) + .05 * o * -e.velocityY / .227, o *= ic(b, r, n, Ja(d, Ne)), a.vars.scrollY = T(n), a.invalidate().duration(o).play(.01), (E && a.vars.scrollY >= i || i - 1 <= r) && Je.to({}, { onUpdate: Qp, duration: o }) } else s.restart(!0); p && p(e) }, e.onWheel = function () { a._ts && a.pause(), 1e3 < dt() - w && (l = 0, w = dt()) }, e.onChange = function (e, t, r, n, o) { if (Bt !== l && Jp(), t && f && m(M(n[2] === t ? c + (e.startX - e.x) : m() + t - n[1])), r) { b.offset && Kp(); var i = o[2] === r, a = i ? u + e.startY - e.y : b() + r - o[1], s = T(a); i && a !== s && (u += s - a), b(s) } (r || t) && j() }, e.onEnable = function () { jc(d, !f && "x"), $.addEventListener("refresh", Qp), pb(je, "resize", Qp), b.smooth && (b.target.style.scrollBehavior = "auto", b.smooth = m.smooth = !1), S.enable() }, e.onDisable = function () { jc(d, !0), qb(je, "resize", Qp), $.removeEventListener("refresh", Qp), S.kill() }, e.lockAxis = !1 !== e.lockAxis, ((n = new k(e)).iOS = E) && !b() && b(1), E && Je.ticker.add(Ba), s = n._dc, a = Je.to(n, { ease: "power4", paused: !0, scrollX: f ? "+=0.1" : "+=0", scrollY: "+=0.1", onUpdate: j, onComplete: s.vars.onComplete }), n } var ee, te = { auto: 1, scroll: 1 }, re = /(input|label|select|textarea)/i, ne = function _captureInputs(e) { var t = re.test(e.target.tagName); (t || ee) && (e._gsapAllow = !0, ee = t) }; $.sort = function (e) { return Ot.sort(e || function (e, t) { return -1e6 * (e.vars.refreshPriority || 0) + e.start - (t.start + -1e6 * (t.vars.refreshPriority || 0)) }) }, $.observe = function (e) { return new k(e) }, $.normalizeScroll = function (e) { if (void 0 === e) return v; if (!0 === e && v) return v.enable(); if (!1 === e) return v && v.kill(); var t = e instanceof k ? e : qc(e); return v && v.target === t.target && v.kill(), Fa(t.target) && (v = t), t }, $.core = { _getVelocityProp: L, _inputObserver: mc, _scrollers: ze, _proxies: qe, bridge: { ss: function ss() { gt || Y("scrollStart"), gt = dt() }, ref: function ref() { return rt } } }, Ea() && Je.registerPlugin($), e.ScrollTrigger = $, e.default = $; if (typeof (window) === "undefined" || window !== e) { Object.defineProperty(e, "__esModule", { value: !0 }) } else { delete e.default } });

//scrollpluin

/*!
 * ScrollToPlugin 3.4.0
 * https://greensock.com
 * 
 * @license Copyright 2020, GreenSock. All rights reserved.
 * Subject to the terms at https://greensock.com/standard-license or for Club GreenSock members, the agreement issued with that membership.
 * @author: Jack Doyle, jack@greensock.com
 */

!function (t, e) { "object" == typeof exports && "undefined" != typeof module ? e(exports) : "function" == typeof define && define.amd ? define(["exports"], e) : e((t = t || self).window = t.window || {}) }(this, function (t) { "use strict"; function k() { return "undefined" != typeof window } function l() { return e || k() && (e = window.gsap) && e.registerPlugin && e } function m(t) { return "string" == typeof t } function n(t, e) { var o = "x" === e ? "Width" : "Height", n = "scroll" + o, r = "client" + o; return t === x || t === s || t === f ? Math.max(s[n], f[n]) - (x["inner" + o] || s[r] || f[r]) : t[n] - t["offset" + o] } function o(t, e) { var o = "scroll" + ("x" === e ? "Left" : "Top"); return t === x && (null != t.pageXOffset ? o = "page" + e.toUpperCase() + "Offset" : t = null != s[o] ? s : f), function () { return t[o] } } function p(t, e) { var n = a(t)[0].getBoundingClientRect(), r = !e || e === x || e === f, i = r ? { top: s.clientTop - (x.pageYOffset || s.scrollTop || f.scrollTop || 0), left: s.clientLeft - (x.pageXOffset || s.scrollLeft || f.scrollLeft || 0) } : e.getBoundingClientRect(), l = { x: n.left - i.left, y: n.top - i.top }; return !r && e && (l.x += o(e, "x")(), l.y += o(e, "y")()), l } function q(t, e, o, r) { return isNaN(t) || "object" == typeof t ? m(t) && "=" === t.charAt(1) ? parseFloat(t.substr(2)) * ("-" === t.charAt(0) ? -1 : 1) + r : "max" === t ? n(e, o) : Math.min(n(e, o), p(t, e)[o]) : parseFloat(t) } function r() { e = l(), k() && e && document.body && (x = window, f = document.body, s = document.documentElement, a = e.utils.toArray, e.config({ autoKillThreshold: 7 }), g = e.config(), u = 1) } var e, u, x, s, f, a, g, i = { version: "3.4.0", name: "scrollTo", rawVars: 1, register: function register(t) { e = t, r() }, init: function init(t, e, n, i, l) { u || r(); var s = this; s.isWin = t === x, s.target = t, s.tween = n, "object" != typeof e ? m((e = { y: e }).y) && "max" !== e.y && "=" !== e.y.charAt(1) && (e.x = e.y) : e.nodeType && (e = { y: e, x: e }), s.vars = e, s.autoKill = !!e.autoKill, s.getX = o(t, "x"), s.getY = o(t, "y"), s.x = s.xPrev = s.getX(), s.y = s.yPrev = s.getY(), null != e.x ? (s.add(s, "x", s.x, q(e.x, t, "x", s.x) - (e.offsetX || 0), i, l, Math.round), s._props.push("scrollTo_x")) : s.skipX = 1, null != e.y ? (s.add(s, "y", s.y, q(e.y, t, "y", s.y) - (e.offsetY || 0), i, l, Math.round), s._props.push("scrollTo_y")) : s.skipY = 1 }, render: function render(t, e) { for (var o, r, i, l, s, u = e._pt, f = e.target, p = e.tween, a = e.autoKill, c = e.xPrev, y = e.yPrev, d = e.isWin; u;)u.r(t, u.d), u = u._next; o = d || !e.skipX ? e.getX() : c, i = (r = d || !e.skipY ? e.getY() : y) - y, l = o - c, s = g.autoKillThreshold, e.x < 0 && (e.x = 0), e.y < 0 && (e.y = 0), a && (!e.skipX && (s < l || l < -s) && o < n(f, "x") && (e.skipX = 1), !e.skipY && (s < i || i < -s) && r < n(f, "y") && (e.skipY = 1), e.skipX && e.skipY && (p.kill(), e.vars.onAutoKill && e.vars.onAutoKill.apply(p, e.vars.onAutoKillParams || []))), d ? x.scrollTo(e.skipX ? o : e.x, e.skipY ? r : e.y) : (e.skipY || (f.scrollTop = e.y), e.skipX || (f.scrollLeft = e.x)), e.xPrev = e.x, e.yPrev = e.y }, kill: function kill(t) { var e = "scrollTo" === t; !e && "scrollTo_x" !== t || (this.skipX = 1), !e && "scrollTo_y" !== t || (this.skipY = 1) } }; i.max = n, i.getOffset = p, i.buildGetter = o, l() && e.registerPlugin(i), t.ScrollToPlugin = i, t.default = i; if (typeof (window) === "undefined" || window !== t) { Object.defineProperty(t, "__esModule", { value: !0 }) } else { delete t.default } });

//lightbox

/*!
 * Lightbox v2.11.3
 * by Lokesh Dhakar
 *
 * More info:
 * http://lokeshdhakar.com/projects/lightbox2/
 *
 * Copyright Lokesh Dhakar
 * Released under the MIT license
 * https://github.com/lokesh/lightbox2/blob/master/LICENSE
 *
 * @preserve
 */
!function (a, b) { "function" == typeof define && define.amd ? define(["jquery"], b) : "object" == typeof exports ? module.exports = b(require("jquery")) : a.lightbox = b(a.jQuery) }(this, function (a) { function b(b) { this.album = [], this.currentImageIndex = void 0, this.init(), this.options = a.extend({}, this.constructor.defaults), this.option(b) } return b.defaults = { albumLabel: "Image %1 of %2", alwaysShowNavOnTouchDevices: !1, fadeDuration: 600, fitImagesInViewport: !0, imageFadeDuration: 600, positionFromTop: 50, resizeDuration: 700, showImageNumberLabel: !0, wrapAround: !1, disableScrolling: !1, sanitizeTitle: !1 }, b.prototype.option = function (b) { a.extend(this.options, b) }, b.prototype.imageCountLabel = function (a, b) { return this.options.albumLabel.replace(/%1/g, a).replace(/%2/g, b) }, b.prototype.init = function () { var b = this; a(document).ready(function () { b.enable(), b.build() }) }, b.prototype.enable = function () { var b = this; a("body").on("click", "a[rel^=lightbox], area[rel^=lightbox], a[data-lightbox], area[data-lightbox]", function (c) { return b.start(a(c.currentTarget)), !1 }) }, b.prototype.build = function () { if (!(a("#lightbox").length > 0)) { var b = this; a('<div id="lightboxOverlay" tabindex="-1" class="lightboxOverlay"></div><div id="lightbox" tabindex="-1" class="lightbox"><div class="lb-outerContainer"><div class="lb-container"><img class="lb-image" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" alt=""/><div class="lb-nav"><a class="lb-prev" aria-label="Previous image" href="" ></a><a class="lb-next" aria-label="Next image" href="" ></a></div><div class="lb-loader"><a class="lb-cancel"></a></div></div></div><div class="lb-dataContainer"><div class="lb-data"><div class="lb-details"><span class="lb-caption"></span><span class="lb-number"></span></div><div class="lb-closeContainer"><a href="#" class="lb-close"></a></div></div></div></div>').appendTo(a("body")), this.$lightbox = a("#lightbox"), this.$overlay = a("#lightboxOverlay"), this.$outerContainer = this.$lightbox.find(".lb-outerContainer"), this.$container = this.$lightbox.find(".lb-container"), this.$image = this.$lightbox.find(".lb-image"), this.$nav = this.$lightbox.find(".lb-nav"), this.containerPadding = { top: parseInt(this.$container.css("padding-top"), 10), right: parseInt(this.$container.css("padding-right"), 10), bottom: parseInt(this.$container.css("padding-bottom"), 10), left: parseInt(this.$container.css("padding-left"), 10) }, this.imageBorderWidth = { top: parseInt(this.$image.css("border-top-width"), 10), right: parseInt(this.$image.css("border-right-width"), 10), bottom: parseInt(this.$image.css("border-bottom-width"), 10), left: parseInt(this.$image.css("border-left-width"), 10) }, this.$overlay.hide().on("click", function () { return b.end(), !1 }), this.$lightbox.hide().on("click", function (c) { "lightbox" === a(c.target).attr("id") && b.end() }), this.$outerContainer.on("click", function (c) { return "lightbox" === a(c.target).attr("id") && b.end(), !1 }), this.$lightbox.find(".lb-prev").on("click", function () { return 0 === b.currentImageIndex ? b.changeImage(b.album.length - 1) : b.changeImage(b.currentImageIndex - 1), !1 }), this.$lightbox.find(".lb-next").on("click", function () { return b.currentImageIndex === b.album.length - 1 ? b.changeImage(0) : b.changeImage(b.currentImageIndex + 1), !1 }), this.$nav.on("mousedown", function (a) { 3 === a.which && (b.$nav.css("pointer-events", "none"), b.$lightbox.one("contextmenu", function () { setTimeout(function () { this.$nav.css("pointer-events", "auto") }.bind(b), 0) })) }), this.$lightbox.find(".lb-loader, .lb-close").on("click", function () { return b.end(), !1 }) } }, b.prototype.start = function (b) { function c(a) { d.album.push({ alt: a.attr("data-alt"), link: a.attr("href"), title: a.attr("data-title") || a.attr("title") }) } var d = this, e = a(window); e.on("resize", a.proxy(this.sizeOverlay, this)), this.sizeOverlay(), this.album = []; var f, g = 0, h = b.attr("data-lightbox"); if (h) { f = a(b.prop("tagName") + '[data-lightbox="' + h + '"]'); for (var i = 0; i < f.length; i = ++i)c(a(f[i])), f[i] === b[0] && (g = i) } else if ("lightbox" === b.attr("rel")) c(b); else { f = a(b.prop("tagName") + '[rel="' + b.attr("rel") + '"]'); for (var j = 0; j < f.length; j = ++j)c(a(f[j])), f[j] === b[0] && (g = j) } var k = e.scrollTop() + this.options.positionFromTop, l = e.scrollLeft(); this.$lightbox.css({ top: k + "px", left: l + "px" }).fadeIn(this.options.fadeDuration), this.options.disableScrolling && a("body").addClass("lb-disable-scrolling"), this.changeImage(g) }, b.prototype.changeImage = function (b) { var c = this, d = this.album[b].link, e = d.split(".").slice(-1)[0], f = this.$lightbox.find(".lb-image"); this.disableKeyboardNav(), this.$overlay.fadeIn(this.options.fadeDuration), a(".lb-loader").fadeIn("slow"), this.$lightbox.find(".lb-image, .lb-nav, .lb-prev, .lb-next, .lb-dataContainer, .lb-numbers, .lb-caption").hide(), this.$outerContainer.addClass("animating"); var g = new Image; g.onload = function () { var h, i, j, k, l, m; f.attr({ alt: c.album[b].alt, src: d }), a(g), f.width(g.width), f.height(g.height), m = a(window).width(), l = a(window).height(), k = m - c.containerPadding.left - c.containerPadding.right - c.imageBorderWidth.left - c.imageBorderWidth.right - 20, j = l - c.containerPadding.top - c.containerPadding.bottom - c.imageBorderWidth.top - c.imageBorderWidth.bottom - c.options.positionFromTop - 70, "svg" === e && (f.width(k), f.height(j)), c.options.fitImagesInViewport ? (c.options.maxWidth && c.options.maxWidth < k && (k = c.options.maxWidth), c.options.maxHeight && c.options.maxHeight < j && (j = c.options.maxHeight)) : (k = c.options.maxWidth || g.width || k, j = c.options.maxHeight || g.height || j), (g.width > k || g.height > j) && (g.width / k > g.height / j ? (i = k, h = parseInt(g.height / (g.width / i), 10), f.width(i), f.height(h)) : (h = j, i = parseInt(g.width / (g.height / h), 10), f.width(i), f.height(h))), c.sizeContainer(f.width(), f.height()) }, g.src = this.album[b].link, this.currentImageIndex = b }, b.prototype.sizeOverlay = function () { var b = this; setTimeout(function () { b.$overlay.width(a(document).width()).height(a(document).height()) }, 0) }, b.prototype.sizeContainer = function (a, b) { function c() { d.$lightbox.find(".lb-dataContainer").width(g), d.$lightbox.find(".lb-prevLink").height(h), d.$lightbox.find(".lb-nextLink").height(h), d.$overlay.focus(), d.showImage() } var d = this, e = this.$outerContainer.outerWidth(), f = this.$outerContainer.outerHeight(), g = a + this.containerPadding.left + this.containerPadding.right + this.imageBorderWidth.left + this.imageBorderWidth.right, h = b + this.containerPadding.top + this.containerPadding.bottom + this.imageBorderWidth.top + this.imageBorderWidth.bottom; e !== g || f !== h ? this.$outerContainer.animate({ width: g, height: h }, this.options.resizeDuration, "swing", function () { c() }) : c() }, b.prototype.showImage = function () { this.$lightbox.find(".lb-loader").stop(!0).hide(), this.$lightbox.find(".lb-image").fadeIn(this.options.imageFadeDuration), this.updateNav(), this.updateDetails(), this.preloadNeighboringImages(), this.enableKeyboardNav() }, b.prototype.updateNav = function () { var a = !1; try { document.createEvent("TouchEvent"), a = !!this.options.alwaysShowNavOnTouchDevices } catch (a) { } this.$lightbox.find(".lb-nav").show(), this.album.length > 1 && (this.options.wrapAround ? (a && this.$lightbox.find(".lb-prev, .lb-next").css("opacity", "1"), this.$lightbox.find(".lb-prev, .lb-next").show()) : (this.currentImageIndex > 0 && (this.$lightbox.find(".lb-prev").show(), a && this.$lightbox.find(".lb-prev").css("opacity", "1")), this.currentImageIndex < this.album.length - 1 && (this.$lightbox.find(".lb-next").show(), a && this.$lightbox.find(".lb-next").css("opacity", "1")))) }, b.prototype.updateDetails = function () { var a = this; if (void 0 !== this.album[this.currentImageIndex].title && "" !== this.album[this.currentImageIndex].title) { var b = this.$lightbox.find(".lb-caption"); this.options.sanitizeTitle ? b.text(this.album[this.currentImageIndex].title) : b.html(this.album[this.currentImageIndex].title), b.fadeIn("fast") } if (this.album.length > 1 && this.options.showImageNumberLabel) { var c = this.imageCountLabel(this.currentImageIndex + 1, this.album.length); this.$lightbox.find(".lb-number").text(c).fadeIn("fast") } else this.$lightbox.find(".lb-number").hide(); this.$outerContainer.removeClass("animating"), this.$lightbox.find(".lb-dataContainer").fadeIn(this.options.resizeDuration, function () { return a.sizeOverlay() }) }, b.prototype.preloadNeighboringImages = function () { if (this.album.length > this.currentImageIndex + 1) { (new Image).src = this.album[this.currentImageIndex + 1].link } if (this.currentImageIndex > 0) { (new Image).src = this.album[this.currentImageIndex - 1].link } }, b.prototype.enableKeyboardNav = function () { this.$lightbox.on("keyup.keyboard", a.proxy(this.keyboardAction, this)), this.$overlay.on("keyup.keyboard", a.proxy(this.keyboardAction, this)) }, b.prototype.disableKeyboardNav = function () { this.$lightbox.off(".keyboard"), this.$overlay.off(".keyboard") }, b.prototype.keyboardAction = function (a) { var b = a.keyCode; 27 === b ? (a.stopPropagation(), this.end()) : 37 === b ? 0 !== this.currentImageIndex ? this.changeImage(this.currentImageIndex - 1) : this.options.wrapAround && this.album.length > 1 && this.changeImage(this.album.length - 1) : 39 === b && (this.currentImageIndex !== this.album.length - 1 ? this.changeImage(this.currentImageIndex + 1) : this.options.wrapAround && this.album.length > 1 && this.changeImage(0)) }, b.prototype.end = function () { this.disableKeyboardNav(), a(window).off("resize", this.sizeOverlay), this.$lightbox.fadeOut(this.options.fadeDuration), this.$overlay.fadeOut(this.options.fadeDuration), this.options.disableScrolling && a("body").removeClass("lb-disable-scrolling") }, new b });
//# sourceMappingURL=lightbox.min.map

//main.js


$(function () {

    $(window).on('load', function () {
        $('.page-loader').delay('500').fadeOut(1000);
    });

    $(document).ready(function () {

        $(document).on('click', '.icon-menu', function () {
            $('.responsive-sidebar-menu').addClass('active');
        });
        $(document).on('click', '.responsive-sidebar-menu .overlay', function () {
            $('.responsive-sidebar-menu').removeClass('active');
        });

        $(document).on('click', '.menu li .scroll-to', function () {
            $('.responsive-sidebar-menu').removeClass('active');
        })


        $(document).on('click', ".color-boxed a", function () {
            $(".color-boxed a").removeClass("clr-active");
            $(this).addClass("clr-active");
        });

        $(document).on('click', ".global-color .setting-toggle", function () {
            $(".global-color").addClass("active");
        });

        $(document).on('click', ".global-color .inner .overlay, .global-color .inner .global-color-option .close-settings", function () {
            $(".global-color").removeClass("active");
        });

    });

    $(window).scroll(function () {

        var windscroll = $(window).scrollTop();
        if (windscroll >= 0) {
            $('.page-section').each(function (i) {
                if ($(this).position().top <= windscroll - -1) {
                    $('.scroll-nav .scroll-to.active').removeClass('active');
                    $('.scroll-nav .scroll-to').eq(i).addClass('active');
                    $('.scroll-nav-responsive a.active').removeClass('active');
                    $('.scroll-nav-responsive a').eq(i).addClass('active');
                }
            });

        } else {

            $('.scroll-nav .scroll-to.active').removeClass('active');
            $('.scroll-nav .scroll-to:first').addClass('active');
            $('.scroll-nav-responsive a.active').removeClass('active');
            $('.scroll-nav-responsive a:first').addClass('active');
        }

        if (windscroll >= 0) {
            $('.scroll-to-page').each(function (i) {

                var wscrolldecress = windscroll + 1;
                // console.log(wscrolldecress);
                if ($(this).position().top <= wscrolldecress - 0) {
                    $('.scroll-nav .scroll-to.active').removeClass('active');
                    $('.scroll-nav .scroll-to').eq(i).addClass('active');
                    $('.scroll-nav-responsive a.active').removeClass('active');
                    $('.scroll-nav-responsive a').eq(i).addClass('active');
                }
            });

        } else {
            $('.scroll-nav .scroll-to.active').removeClass('active');
            $('.scroll-nav .scroll-to:first').addClass('active');
            $('.scroll-nav-responsive a.active').removeClass('active');
            $('.scroll-nav-responsive a:first').addClass('active');
        }

    }).scroll();
    // function remove_is_active() {
    //     $(".menu .scroll-to").removeClass("active");
    // }

    // gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

    // var container = document.querySelector("#smooth-content");

    // var height;
    // function setHeight() {
    //     height = container.clientHeight;


    //     document.body.style.height = height + "px";
    // }
    // ScrollTrigger.addEventListener("refreshInit", setHeight);

    // gsap.to(container, {
    //     y: () => -(height - document.documentElement.clientHeight),
    //     ease: "none",
    //     scrollTrigger: {
    //         trigger: container,
    //         start: "top top",
    //         end: "bottom bottom",
    //         scrub: 1,
    //         invalidateOnRefresh: true,
    //     }
    // });

    window.addEventListener('scroll', {
        scroll_animations,
    });


    // Array.prototype.slice.call(document.querySelectorAll(".page-section")).forEach(function (e, t) {
    //     ScrollTrigger.create({
    //         trigger: e,
    //         id: t + 1,
    //         start: "top center",
    //         end: function () {
    //             return "+=".concat(e.clientHeight - 30);
    //         },
    //         toggleActions: "play reverse none reverse",
    //         toggleClass: { targets: e, className: "active" },
    //         onToggle: function () {
    //             $(".menu .scroll-to").removeClass("active"), "" != e.id && $('.menu .scroll-to[href*="#' + e.id + '"]').addClass("active");
    //         },
    //     });
    // });

    // document.querySelectorAll('.scroll-to').forEach((e) => {
    //     const target = e.getAttribute('href');
    //     const targetEl = document.querySelector(target);
    //     // const targetRect = targetEl.getBoundingClientRect();


    //     var offset = gsap.getProperty("#smooth-content", "y");
    //     var position = jQuery(target).get(0).getBoundingClientRect().top - offset;


    //     e.addEventListener('click', (e) => {
    //         e.preventDefault();

    //         gsap.to(window, {
    //             scrollTo: position,
    //             ease: "power4",
    //             duration: 0.1,
    //             onToggle: function () {
    //                 console.log('toggle');
    //                 remove_is_active();
    //                 if (targetEl.id != "") $('.menu .scroll-to[href*="#' + targetEl.id + '"]').addClass("active");
    //             },
    //             onLeaveBack: function () {
    //                 console.log('leave back');
    //                 remove_is_active();
    //                 if (targetEl.id != "") $('.menu .scroll-to[href*="#' + targetEl.id + '"]').addClass("active");
    //             },
    //             onLeave: function () {
    //                 console.log('leave');
    //                 remove_is_active();
    //                 if (targetEl.id != "") $('.menu .scroll-to[href*="#' + targetEl.id + '"]').addClass("active");
    //             },
    //             overwrite: !0,
    //         });
    //     });



    // });

});



function scroll_animations() {
    // var allow_on_mobile = !0;
    // if (typeof config_scroll_animation_on_mobile !== "undefined") allow_on_mobile = config_scroll_animation_on_mobile;
    // if (allow_on_mobile == !1 && is_mobile_device) return;
    var defaults = {
        duration: 1.2,
        ease: "power4.out",
        animation: "fade_from_bottom",
        once: !1,
    };
    gsap.utils.toArray(".scroll-animation").forEach(function (box) {
        var gsap_obj = {};
        var settings = {
            // ease: box.dataset.animationEase || defaults.ease,
            duration: box.dataset.animationDuration || defaults.duration,
        };
        var animations = {
            fade_from_bottom: {
                y: 180,
                opacity: 0,
            },
            fade_from_top: {
                y: -180,
                opacity: 0,
            },
            fade_from_left: {
                x: -180,
                opacity: 0,
            },
            fade_from_right: {
                x: 180,
                opacity: 0,
            },
            fade_in: {
                opacity: 0,
            },
            rotate_up: {
                y: 180,
                rotation: 10,
                opacity: 0,
            },
        };
        var scroll_trigger = {
            scrollTrigger: {
                trigger: box,
                once: defaults.once,
                start: "top bottom+=20%",
                // start: "top bottom+=5%",
                toggleActions: "play none none reverse",
                markers: !1,
            },
        };
        jQuery.extend(gsap_obj, settings);
        jQuery.extend(gsap_obj, animations[box.dataset.animation || defaults.animation]);
        jQuery.extend(gsap_obj, scroll_trigger);
        gsap.from(box, gsap_obj);
    });
}
scroll_animations();


// typing effect code

document.addEventListener("DOMContentLoaded", () => {
    const typingElement = document.getElementById("typing");
    const texts = ["WordPress Developer", "Freelancer", "Bug Fixing", "Elementor"];
    let textIndex = 0;
    let charIndex = 0;
    let isDeleting = false;

    const typingSpeed = 100;
    const eraseSpeed = 60;
    const delayBetweenWords = 1500;

    function type() {
        const currentText = texts[textIndex];

        // Update the text content
        typingElement.textContent = currentText.substring(0, charIndex);

        if (!isDeleting && charIndex < currentText.length) {
            // typing
            charIndex++;
            setTimeout(type, typingSpeed);
        }
        else if (isDeleting && charIndex > 0) {
            // deleting
            charIndex--;
            setTimeout(type, eraseSpeed);
        }
        else {
            // switch between typing and deleting
            if (!isDeleting) {
                isDeleting = true;
                setTimeout(type, delayBetweenWords);
            } else {
                isDeleting = false;
                textIndex = (textIndex + 1) % texts.length;
                setTimeout(type, 500);
            }
        }
    }

    type();
});


//colors.js



function color1() {
    document.documentElement.style.setProperty('--primary_color', '#28e98c');
}
function color2() {
    document.documentElement.style.setProperty('--primary_color', '#e4af12');
}
function color3() {
    document.documentElement.style.setProperty('--primary_color', '#fe6f1d');
}
function color4() {
    document.documentElement.style.setProperty('--primary_color', '#14c5fd');
}
function color5() {
    document.documentElement.style.setProperty('--primary_color', '#c0c0c0');
}
function color6() {
    document.documentElement.style.setProperty('--primary_color', '#1338f3');
}
function color7() {
    document.documentElement.style.setProperty('--primary_color', '#f31313');
}
function color8() {
    document.documentElement.style.setProperty('--primary_color', '#ff99cc');
}
