import './styles.css';
import { App } from './app';

const app = new App(document.getElementById('app')!);
if (import.meta.env.DEV) (window as unknown as { f2l: App }).f2l = app;
