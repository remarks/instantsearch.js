import forEach from 'lodash/forEach';
import isString from 'lodash/isString';
import isFunction from 'lodash/isFunction';
import cx from 'classnames';
import Hogan from 'hogan.js';

import connectSearchBox from '../../connectors/search-box/connectSearchBox.js';
import defaultTemplates from './defaultTemplates.js';

import {
  bemHelper,
  getContainerNode,
} from '../../lib/utils.js';

const bem = bemHelper('ais-search-box');
const KEY_ENTER = 13;
const KEY_SUPPRESS = 8;

const renderer = ({
  containerNode,
  cssClasses,
  placeholder,
  poweredBy,
  templates,
  autofocus,
  searchOnEnterKeyPressOnly,
  wrapInput,
}) => ({
  refine,
  query,
  onHistoryChange,
}, isFirstRendering) => {
  if (isFirstRendering) {
    const INPUT_EVENT = window.addEventListener ?
      'input' :
      'propertychange';
    const input = createInput(containerNode);
    const isInputTargeted = input === containerNode;
    if (isInputTargeted) {
      // To replace the node, we need to create an intermediate node
      const placeholderNode = document.createElement('div');
      input.parentNode.insertBefore(placeholderNode, input);
      const parentNode = input.parentNode;
      const wrappedInput = wrapInput ? wrapInputFn(input, cssClasses) : input;
      parentNode.replaceChild(wrappedInput, placeholderNode);
    } else {
      const wrappedInput = wrapInput ? wrapInputFn(input, cssClasses) : input;
      containerNode.appendChild(wrappedInput);
    }
    addDefaultAttributesToInput(placeholder, input, query, cssClasses);
    // Optional "powered by Algolia" widget
    if (poweredBy) {
      addPoweredBy(input, poweredBy, templates);
    }
    // When the page is coming from BFCache
    // (https://developer.mozilla.org/en-US/docs/Working_with_BFCache)
    // then we force the input value to be the current query
    // Otherwise, this happens:
    // - <input> autocomplete = off (default)
    // - search $query
    // - navigate away
    // - use back button
    // - input query is empty (because <input> autocomplete = off)
    window.addEventListener('pageshow', () => {
      input.value = query;
    });

    // Update value when query change outside of the input
    onHistoryChange(fullState => {
      input.value = fullState.query || '';
    });

    if (autofocus === true || autofocus === 'auto' && query === '') {
      input.focus();
      input.setSelectionRange(query.length, query.length);
    }

    // search on enter
    if (searchOnEnterKeyPressOnly) {
      addListener(input, INPUT_EVENT, e => {
        refine(getValue(e), false);
      });
      addListener(input, 'keyup', e => {
        if (e.keyCode === KEY_ENTER) refine(getValue(e));
      });
    } else {
      addListener(input, INPUT_EVENT, getInputValueAndCall(refine));

      // handle IE8 weirdness where BACKSPACE key will not trigger an input change..
      // can be removed as soon as we remove support for it
      if (INPUT_EVENT === 'propertychange' || window.attachEvent) {
        addListener(input, 'keyup', ifKey(KEY_SUPPRESS, getInputValueAndCall(refine)));
      }
    }
  } else {
    const input = getInput(containerNode);
    const isFocused = document.activeElement === input;
    if (!isFocused && query !== input.value) {
      input.value = query;
    }
  }
};

const usage = `Usage:
searchBox({
  container,
  [ placeholder ],
  [ cssClasses.{input,poweredBy} ],
  [ poweredBy=false || poweredBy.{template, cssClasses.{root,link}} ],
  [ wrapInput ],
  [ autofocus ],
  [ searchOnEnterKeyPressOnly ],
  [ queryHook ]
})`;

/**
 * @typedef {Object} SearchBoxPoweredByCSSClasses
 * @property  {string|string[]} [root] CSS class to add to the root element.
 * @property  {string|string[]} [link] CSS class to add to the link element.
 */

/**
 * @typedef {Object} SearchBoxPoweredByOption
 * @property {function|string} template Template used for displaying the link. Can accept a function or a Hogan string.
 * @property {SearchBoxPoweredByCSSClasses} [cssClasses] CSS classes added to the powered-by badge.
 */

/**
 * @typedef {Object} SearchBoxCSSClasses
 * @property  {string|string[]} [cssClasses.root] CSS class to add to the
 * wrapping `<div>` (if `wrapInput` set to `true`).
 * @property  {string|string[]} [cssClasses.input] CSS class to add to the input.
 */

/**
 * @typedef {Object} SearchBoxWidgetOptions
 * @property  {string|HTMLElement} container CSS Selector or HTMLElement to insert the widget.
 * @property  {string} [placeholder] Input's placeholder.
 * @property  {boolean|SearchBoxPoweredByOption} [poweredBy=false] Define if a "powered by Algolia" link should be added near the input.
 * @property  {boolean} [wrapInput=true] Wrap the input in a `div.ais-search-box`.
 * @property  {boolean|string} [autofocus="auto"] autofocus on the input.
 * @property  {boolean} [searchOnEnterKeyPressOnly=false] If set, trigger the search
 * once `<Enter>` is pressed only.
 * @property  {SearchBoxCSSClasses} [cssClasses] CSS classes to add.
 * @property  {function} [queryHook] A function that will be called every time a new search would be done. You
 * will get the query as first parameter and a search(query) function to call as the second parameter.
 * This queryHook can be used to debounce the number of searches done from the searchBox.
 */

/**
 * The searchbox widget is used to let the user set a text based query.
 *
 * This is usually the  main entry point to start the search in an instantsearch context. For that
 * reason is usually placed on top, and not hidden so that the user can start searching right
 * away.
 *
 * @type {WidgetFactory}
 * @param {SearchBoxWidgetOptions} $0 Options used to configure a SearchBox widget.
 * @return {Widget} Creates a new instance of the SearchBox widget.
 * @example
 * search.addWidget(
 *   instantsearch.widgets.searchBox({
 *     container: '#q',
 *     placeholder: 'Search for products',
 *     autofocus: false,
 *     poweredBy: true
 *   })
 * );
 */
export default function searchBox({
  container,
  placeholder = '',
  cssClasses = {},
  poweredBy = false,
  wrapInput = true,
  autofocus = 'auto',
  searchOnEnterKeyPressOnly = false,
  queryHook,
} = {}) {
  if (!container) {
    throw new Error(usage);
  }

  const containerNode = getContainerNode(container);

  // Only possible values are 'auto', true and false
  if (typeof autofocus !== 'boolean') {
    autofocus = 'auto';
  }

  // Convert to object if only set to true
  if (poweredBy === true) {
    poweredBy = {};
  }

  const specializedRenderer = renderer({
    containerNode,
    cssClasses,
    placeholder,
    poweredBy,
    templates: defaultTemplates,
    autofocus,
    searchOnEnterKeyPressOnly,
    wrapInput,
  });

  try {
    const makeWidget = connectSearchBox(specializedRenderer);
    return makeWidget({queryHook});
  } catch (e) {
    throw new Error(usage);
  }
}

// the 'input' event is triggered when the input value changes
// in any case: typing, copy pasting with mouse..
// 'onpropertychange' is the IE8 alternative until we support IE8
// but it's flawed: http://help.dottoro.com/ljhxklln.php

function createInput(containerNode) {
  // Returns reference to targeted input if present, or create a new one
  if (containerNode.tagName === 'INPUT') {
    return containerNode;
  }
  return document.createElement('input');
}

function getInput(containerNode) {
  // Returns reference to targeted input if present, or look for it inside
  if (containerNode.tagName === 'INPUT') {
    return containerNode;
  }
  return containerNode.querySelector('input');
}

function wrapInputFn(input, cssClasses) {
  // Wrap input in a .ais-search-box div
  const wrapper = document.createElement('div');
  const CSSClassesToAdd = cx(bem(null), cssClasses.root).split(' ');
  CSSClassesToAdd.forEach(cssClass => wrapper.classList.add(cssClass));
  wrapper.appendChild(input);
  return wrapper;
}

function addListener(el, type, fn) {
  if (el.addEventListener) {
    el.addEventListener(type, fn);
  } else {
    el.attachEvent(`on${type}`, fn);
  }
}

function getValue(e) {
  return (e.currentTarget ? e.currentTarget : e.srcElement).value;
}

function ifKey(expectedKeyCode, func) {
  return actualEvent => actualEvent.keyCode === expectedKeyCode && func(actualEvent);
}

function getInputValueAndCall(func) {
  return actualEvent => func(getValue(actualEvent));
}

function addDefaultAttributesToInput(placeholder, input, query, cssClasses) {
  const defaultAttributes = {
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    placeholder,
    role: 'textbox',
    spellcheck: 'false',
    type: 'text',
    value: query,
  };

  // Overrides attributes if not already set
  forEach(defaultAttributes, (value, key) => {
    if (input.hasAttribute(key)) {
      return;
    }
    input.setAttribute(key, value);
  });

  // Add classes
  const CSSClassesToAdd = cx(bem('input'), cssClasses.input).split(' ');
  CSSClassesToAdd.forEach(cssClass => input.classList.add(cssClass));
}

function addPoweredBy(input, poweredBy, templates) {
  // Default values
  poweredBy = {
    cssClasses: {},
    template: templates.poweredBy,
    ...poweredBy,
  };

  const poweredByCSSClasses = {
    root: cx(bem('powered-by'), poweredBy.cssClasses.root),
    link: cx(bem('powered-by-link'), poweredBy.cssClasses.link),
  };

  const url = 'https://www.algolia.com/?' +
    'utm_source=instantsearch.js&' +
    'utm_medium=website&' +
    `utm_content=${location.hostname}&` +
    'utm_campaign=poweredby';

  const templateData = {
    cssClasses: poweredByCSSClasses,
    url,
  };

  const template = poweredBy.template;
  let stringNode;

  if (isString(template)) {
    stringNode = Hogan.compile(template).render(templateData);
  }
  if (isFunction(template)) {
    stringNode = template(templateData);
  }

  // Crossbrowser way to create a DOM node from a string. We wrap in
  // a `span` to make sure we have one and only one node.
  const tmpNode = document.createElement('div');
  tmpNode.innerHTML = `<span>${stringNode.trim()}</span>`;
  const htmlNode = tmpNode.firstChild;

  input.parentNode.insertBefore(htmlNode, input.nextSibling);
}
