module.exports = function (sails) {

	/**
	 * Module dependencies.
	 */

	var util			= require('sails-util'),
		async			= require('async'),
		CaptainsLog		= require('../hooks/logger/captains');


	/**
	 * Expose Configuration loader
	 *
	 * Load command-line overrides
	 *
	 * TODO: consider merging this into the `app` directory
	 *
	 * For reference, config priority is:
	 * --> implicit defaults
	 * --> environment variables
	 * --> user config files
	 * --> local config file
	 * --> configOverride ( in call to sails.lift() )
	 * --> --cmdline args
	 */

	return function loadConfig (cb) {

		// Save reference to context for use in closures
		var Configuration = this;


		// Commence with loading/validating/defaulting all the rest of the config
		async.auto({

			/**
			 * At this point, sails.config is composed of config from:
			 * + command line flags
			 * + options passed into sails.load() / sails.lift()
			 *
			 * This step clones this into an "overrides" object
			 * and normalizes/validates it
			 */
			mapOverrides: function (cb) {

				// Take the overrides + app path
				// and clone and save them for later
				var overrides = util.cloneDeep(sails.config || {});

				// Map Sails options from overrides
				overrides = util.merge(overrides, {

					// `--verbose` command-line argument
					// `--silly` command-line argument
					log:	overrides.verbose ? {level: 'verbose'} : 
							overrides.silly ? {level: 'silly'} :
							undefined,

					// `--port=?` command-line argument
					port: overrides.port || undefined,

					// `--prod` command-line argument
					environment: overrides.prod ? 'production' : undefined

				});


				// Pass on overrides object
				cb(null, overrides);
			},



			/**
			 * Immediately instantiate the default logger in case a log-worthy event occurs
			 * Even though the app might actually use its own custom logger, we don't know
			 * all of the user configurations yet.
			 *
			 * Makes sails.log accessible for the first time
			 */
			logger: ['mapOverrides', function (cb, async_data) {
				var logConfigSoFar = async_data.mapOverrides.log;
				sails.log = new CaptainsLog(logConfigSoFar);
				cb();
			}],


			/**
			 * Get the data from the package.json file 
			 * of the currently running installation of Sails.
			 * (e.g. version/dependency info)
			 *
			 * Also expose the version/dependency info on the `sails` object.
			 */
			package_json: function (cb) {

				var packageJSONPath = __dirname + '/../../';
				util.getPackage(packageJSONPath, function (err, json) {
					if (err) return cb(err);

					sails.version		= json.version;
					sails.majorVersion	= sails.version.split('.')[0].replace(/[^0-9]/g,'');
					sails.minorVersion	= sails.version.split('.')[1].replace(/[^0-9]/g,'');
					sails.patchVersion	= sails.version.split('.')[2].replace(/[^0-9]/g,'');
					sails.dependencies	= json.dependencies;

					cb();
				});
			},


			/**
			 * Ensure that environment variables are applied to important configs
			 */
			mixinDefaults: ['mapOverrides', function (cb, results) {

				// Get overrides
				var overrides = results.mapOverrides; //util.cloneDeep(results.mapOverrides);

				// Apply environment variables
				// (if the config values are not set in overrides)
				overrides.environment = overrides.environment || process.env.NODE_ENV;
				overrides.port = overrides.port || process.env.PORT;

				// Generate implicit, built-in framework defaults for the app
				var implicitDefaults = Configuration.defaults(overrides.appPath || process.cwd());

				// Extend copy of implicit defaults with user config
				var mergedConfig =
					util.merge(
						util.cloneDeep(implicitDefaults),
						overrides);

				// Override the environment variable so express and other modules 
				// which expect NODE_ENV to be set mirror the configured Sails environment.
				sails.log.verbose('Setting Node environment...');
				process.env['NODE_ENV'] = mergedConfig.environment;		

				cb(null, mergedConfig);
			}]

		},


		function configLoaded (err, results) {
			if (err) {
				sails.log.error('Error encountered loading config:', err);
				return cb(err);
			}

			// Override the contents of sails.config with `validatedConfig`
			sails.config = results.mixinDefaults;
			cb();
		});
	};

};
