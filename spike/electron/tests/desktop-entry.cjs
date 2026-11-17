const { app } = require('electron');
const path = require('node:path');
if (!process.env.ZHD_TEST_USER_DATA || !path.isAbsolute(process.env.ZHD_TEST_USER_DATA)) throw new Error('Test userData must be explicit');
app.setPath('userData', process.env.ZHD_TEST_USER_DATA);
require('../electron/main.cjs');
