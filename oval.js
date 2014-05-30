function iter(array, callback) {
	if(typeof array !== 'object') return callback(array);
  	var i=0, len = array.length;
  	for ( ; i < len ; i++ ) {
      callback(array[i]);
  	}
}
function iter_obj(object, callback) {
	for (var property in object) {
		if (object.hasOwnProperty(property)) {
			callback(property, object[property]);
		}
	}
}
function in_array(needle, haystack) {
	if(typeof haystack !== 'object') {
    if(needle === haystack) return true;
    else return false;
  }
  for(var key in haystack) {
    if(needle === haystack[key]) {
      return true;
    }
  }
  return false;
}

var oval = {
	errDesc: {
		'property_nonexist': 'Required property does not exist',
		'all_poly_options_failed': 'None of the requirements are met for polymorphic type',
	},
	interrupt: true,
	// drop: in interrupt mode throws an error, otherwise pushes an error to the error array
	drop: function(err) {
		if(this.interrupt) { throw err; }
		else this.err.push(err);
	},
	match: function(sample, pattern, noint_pname) {
		var self = this;
		if(typeof noint_pname === 'undefined') noint_pname = false;
		var propertyName;
		if(typeof noint_pname === 'boolean') {
			propertyName = '<root>';
			self.interrupt = !noint_pname; 
			self.err = [];
			// console.log('ROOT. Self interrupt is', self.interrupt, 'and self err is ', self.err);
		}
		else {
			propertyName = noint_pname;
			// console.log('NEST. Property name is ', propertyName);
		}
		function doSinglePattern(p) {
			if(typeof p === 'string') {
				if(self.types.hasOwnProperty(p)) self.types[p].call(self, sample, {}, propertyName);
				else this.drop({property: propertyName, errtype: 'unknown_type'});
			}
			else self.types[p.type].call(self, sample, p, propertyName);
		}
		// pattern may be an array for a polymorphic type
		if(pattern instanceof Array) {
			var oneSuccess = false, poly_err = [];
			var intmask = self.interrupt;
			self.interrupt = true;
			iter(pattern, function(poly_option) {
				// console.log('poly option: ', poly_option, oneSuccess, poly_err);
				if(!oneSuccess) {
					try {
						doSinglePattern(poly_option);
						oneSuccess = true;    
					}
					catch(e) {
						poly_err.push(e);
					}         
				}
			});
			self.interrupt = intmask;
			// console.log('finally, os is ', oneSuccess)
			if(!oneSuccess) self.drop({property: propertyName, errtype: 'all_poly_options_failed', data: poly_err});
		}
		else {
			doSinglePattern(pattern);
		}
		return self.err;
	},
	types: {
		object: function(sample, pattern, propertyName) {
			var self = this;
			var propNamePrefix = (propertyName !== '<root>') ? propertyName+' > ' : '';
			iter_obj(pattern.props, function(prop, directives) {
				if(!sample.hasOwnProperty(prop) && !directives.optional)
					self.drop({property: prop, errtype: 'prop_nonexist'});
				else if(sample.hasOwnProperty(prop)) {
					self.match.call(self, sample[prop], directives, propNamePrefix+prop);
				}
			});
		},
		// for stringified objects. Parses JSON and passed all data to an "object" handler
		json: function(sample, pattern, propertyName) {
			var parsed;
			try { parsed = JSON.parse(sample); }
			catch(e) { this.drop({property: propertyName, errtype: 'jsonparse_failed', original_error: e} ); }
			this.types.object.call(this, parsed, pattern, propertyName);
		},
		string: function(sample, pattern, propertyName) {
			var self = this;
			// must be of string type
			if(typeof sample !== 'string') self.drop({property: propertyName, errtype: 'wrong_type'});
			// "size" directive: length of string
			if(pattern.size) {
				// "size" may be an array difining length range: [minlength, maxlength]..
				if(pattern.size instanceof Array) {
					if(sample.length < pattern.size[0]) self.drop({property: propertyName, errtype: 'toosmall'});
					if(sample.length > pattern.size[1]) self.drop({property: propertyName, errtype: 'toobig'});
				}
				// ..or it can be a number
				else if(sample.length !== pattern.size) self.drop({property: propertyName, errtype: 'size_notequal'});
			}
			// "whitelist" directive: declares an list of allowed values
			if(pattern.whitelist && !in_array(sample, pattern.whitelist)) self.drop({property: propertyName, errtype: 'not_in_whitelist'});
			// "partial_blacklist" directive: declares a list of words that when found in a string lead to validation failure
			if(pattern.partial_blacklist) {
				iter(pattern.partial_blacklist, function(entry) {
					if(sample.indexOf(entry) !== (-1)) self.drop({property: propertyName, errtype: 'blacklisted_fragment', fragment: entry });
				});
			}
			// "blacklist" directive: declares a list of banned values (exact values this time)
			if(pattern.blacklist && in_array(sample, pattern.blacklist)) self.drop({property: propertyName, errtype: 'in_blacklist'});
			// "regex" directive: declares a regex (of an array of regexes) that our string must be tested against
			if(pattern.regex) {
				iter(pattern.regex, function(expr) {
					if(!expr.text(sample)) self.drop({property: propertyName, errtype: 'regex_failed', expr: expr});
				});
			}
			// "black_regex": regex-blacklist
			if(pattern.black_regex) {
				iter(pattern.regex, function(expr) {
					if(expr.text(sample)) self.drop({property: propertyName, errtype: 'black_regex', expr: expr});
				});
			}
		},
		number: function(sample, pattern, propertyName) {
			var self = this;
			// "nostring" directive: if true, the value '42' (string) will not pass, otherwise it will
			if(typeof sample !== 'number' && pattern.nostring) self.drop({property: propertyName, errtype: 'wrong_type'});
			var radix = pattern.radix						// `radix` directive (self-explanatory)
			, float = pattern.float || false		// `float` directive: will parse a number as float
			, filter = pattern.filter || false	// `filter` directive: will parse decimal numbers strictly, no illegal characters allowed
			, number;
			if(filter) {
				var expr = float ? /^(\-|\+)?([0-9]+(\.[0-9]+)?|Infinity)$/ : /^(\-|\+)?([0-9]+|Infinity)$/;
				if(!expr.test(sample)) self.drop({property: propertyName, errtype: 'wrong_format'});
				else number = Number(sample);
			}
			else number = float ? parseFloat(sample) : parseInt(sample, radix);
			if(isNaN(number)) self.drop({property: propertyName, errtype: 'not_number'});
			if(pattern.range) {
				// a range which our number must fit
				if(pattern.range instanceof Array) {
					if(number < pattern.range[0]) self.drop({property: propertyName, errtype: 'toosmall'});
					if(number > pattern.range[1]) self.drop({property: propertyName, errtype: 'toobig'});
				}
				//  if `range` directive is define as a single number, the number must be equal
				else if(number != pattern.range) self.drop({property: propertyName, errtype: 'notequal'});
			}
		}
	}
};
