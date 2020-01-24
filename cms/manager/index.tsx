
// @ts-ignore
import style from './index.css.js';

import * as React from 'preact';
import Router, {route} from 'preact-router';

import * as rpc from '@smogon/rpc-client';

import Main from './main.js';
import Revision from './revision.js';

const App = () => {
    return (
        <Router>
          <Main path="/" />
          <Revision path="/uhh" />
        </Router>
    )
}
//const App = <h1>Hello World! sup</h1>;

let node = document.createElement('div');
document.body.appendChild(node);

React.render(<App />, node);

route('/', true);
