/*
 * ofd.js - A Javascript class for reading and rendering ofd files
 * <https://github.com/DLTech21/ofd.js>
 *
 * Copyright (c) 2020. DLTech21 All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

/**
 * Modify by Ycsx on 2026-06-25
 * 修改 ofd.js 的导出，使其符合 eslint 规范
 * 依赖版本升级
 * Template模式使用原作者方式展示
 * PathContent模式使用新增Canvas方式展示
 */

import { calPageBox, calPageBoxScale, renderPage } from "./ofd_render";
import { parseOfdSteps } from "./ofd_parser";
import { getPageScal, setPageScal } from "./ofd_util";

export function parseOfdDocument(options) {
    function doParseOFD(options) {
        parseOfdSteps(options.ofd)
            .then(data => { if (options.success) options.success(data); })
            .catch(err => { console.log(err); if (options.fail) options.fail(err); });
    }
    //console.log('parseOfdDocument options=', options);
    if (options.ofd instanceof File || options.ofd instanceof ArrayBuffer) {
        doParseOFD(options);
    } else {
        // Use native fetch instead of jszip-utils
        fetch(options.ofd)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
                }
                return response.arrayBuffer();
            })
            .then(data => {
                options.ofd = data; //data is an ArrayBuffer
                doParseOFD(options);
            })
            .catch(err => {
                if (options.fail) {
                    options.fail(err);
                } else {
                    console.error(err);
                }
            });
    }
}


export const renderOfd = function (screenWidth, ofd) {
    let divArray = [];
    if (!ofd) {
        return divArray;
    }
    for (const page of ofd.pages) {
        let box = calPageBox(screenWidth, ofd.document, page);
        const pageId = Object.keys(page)[0];
        let pageDiv = document.createElement('div');
        pageDiv.id = pageId;
        pageDiv.setAttribute('style', `margin-bottom: 20px;position: relative;width:${box.w}px;height:${box.h}px;background: white;`)
        renderPage(pageDiv, page, ofd.tpls, ofd.fontResObj, ofd.drawParamResObj, ofd.multiMediaResObj);
        divArray.push(pageDiv);
    }
    return divArray;
}

export const renderOfdByScale = function (ofd) {
    let divArray = [];
    if (!ofd) {
        return divArray;
    }
    for (const page of ofd.pages) {
        let box = calPageBoxScale(ofd.document, page);
        const pageId = Object.keys(page)[0];
        let pageDiv = document.createElement('div');
        pageDiv.id = pageId;
        pageDiv.setAttribute('style', `margin-bottom: 20px;position: relative;width:${box.w}px;height:${box.h}px;background: white;`)
        renderPage(pageDiv, page, ofd.tpls, ofd.fontResObj, ofd.drawParamResObj, ofd.multiMediaResObj);
        divArray.push(pageDiv);
    }
    return divArray;
}

export const setPageScale = function (scale) {
    setPageScal(scale);
}

export const getPageScale = function () {
    return getPageScal();
}

export { calPageBox, calPageBoxScale, renderPage }

