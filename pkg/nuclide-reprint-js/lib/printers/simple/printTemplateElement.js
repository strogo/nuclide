

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

function printTemplateElement(print, node) {
  return [node.value.raw];
}

module.exports = printTemplateElement;