// ==UserScript==
// @name         gdrive for wtube
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  nm
// @author       w
// @match        https://o.okea.moe/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// ==/UserScript==

document.xmlHttpRequest = function(opts) {
    if (typeof GM_xmlhttpRequest === 'undefined') {
        GM.xmlHttpRequest(opts);
    } else {
        GM_xmlhttpRequest(opts);
    }
};
