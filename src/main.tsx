import { render } from 'preact';
import { App } from './App';
import { boot } from './state/store';
import './styles.css';

render(<App />, document.getElementById('root')!);
boot().catch(() => {
  document.getElementById('root')!.innerHTML =
    '<p class="fatal">Tab could not open its storage. Private windows in some browsers block IndexedDB. Try a normal window.</p>';
});
