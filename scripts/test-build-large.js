'use strict';
process.env.BUILD_LARGE='1';
process.env.LOCAL_MC_VERSION=process.env.LOCAL_MC_VERSION||'1.21.4';
require('./test-build-network');
