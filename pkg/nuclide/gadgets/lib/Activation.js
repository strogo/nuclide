'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import type {Commands} from '../types/Commands';
import type {GadgetsService} from '../../gadgets-interfaces';

import {CompositeDisposable} from 'atom';
import createCommands from './createCommands';
import createGadgetsService from './createGadgetsService';
import createStateStream from './createStateStream';
import getInitialState from './getInitialState';
import observableFromSubscribeFunction from './observableFromSubscribeFunction';
import Rx from 'rx';
import {DOM as RxDom} from 'rx-dom';
import syncAtomCommands from './syncAtomCommands';
import trackActions from './trackActions';

class Activation {
  _disposables: CompositeDisposable;
  commands: Commands;

  constructor(initialState: ?Object) {
    initialState = getInitialState();
    const action$ = new Rx.Subject();
    const state$ = createStateStream(action$, initialState);
    const commands = this.commands = createCommands(action$, () => state$.getValue());

    const getGadgets = state => state.get('gadgets');
    const gadget$ = state$.map(getGadgets).distinctUntilChanged();

    this._disposables = new CompositeDisposable(
      action$,

      // Handle all gadget URLs
      atom.workspace.addOpener(uri => commands.openUri(uri)),

      // Re-render all pane items when (1) new items are added, (2) new gadgets are registered and
      // (3) the active pane item changes.
      observableFromSubscribeFunction(atom.workspace.observePaneItems.bind(atom.workspace))
        .merge(
          observableFromSubscribeFunction(
            atom.workspace.onDidChangeActivePaneItem.bind(atom.workspace)
          )
        )
        .merge(gadget$)
        .throttle(100)
        .forEach(() => this.commands.renderPaneItems()),

      // Clean up when pane items are destroyed.
      observableFromSubscribeFunction(atom.workspace.onDidDestroyPaneItem.bind(atom.workspace))
        .forEach(({item}) => this.commands.cleanUpDestroyedPaneItem(item)),

      // Keep the atom commands up to date with the registered gadgets.
      syncAtomCommands(gadget$, commands),

      // Collect some analytics about gadget actions.
      trackActions(action$),

      // Update the expanded Flex scale whenever the user starts dragging a handle. Use the capture
      // phase since resize handles stop propagation of the event during the bubbling phase.
      RxDom.fromEvent(document, 'mousedown', true)
        .filter(event => event.target.nodeName.toLowerCase() === 'atom-pane-resize-handle')
        // Get the models that represent the containers being resized:
        .flatMap(event => {
          const handleElement = event.target;
          return [
            handleElement.previousElementSibling && handleElement.previousElementSibling.model,
            handleElement.nextElementSibling && handleElement.nextElementSibling.model,
          ].filter(paneItemContainer => paneItemContainer !== null);
        })
        // Make sure these are actually pane item containers:
        .filter(paneItemContainer => {
          return ('getItems' in paneItemContainer) && ('getFlexScale' in paneItemContainer);
        })
        .forEach(paneItemContainer => this.commands.updateExpandedFlexScale(paneItemContainer)),
    );
  }

  deactivate() {
    this.commands.deactivate();
    this._disposables.dispose();
  }

  provideGadgetsService(): GadgetsService {
    return createGadgetsService(this.commands);
  }

}

module.exports = Activation;
