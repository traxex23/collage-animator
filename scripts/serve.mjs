// Serves the project so film/index.html can load its images and audio in a browser.
import express from 'express';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(express.static(fileURLToPath(new URL('..', import.meta.url))));
app.get('/', (_, res) => res.redirect('/film/'));
app.listen(5177, () => console.log('http://localhost:5177/film/'));
