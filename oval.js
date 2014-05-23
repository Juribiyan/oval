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
	drop: function(err) {
		if(this.interrupt) { throw err }
		else this.err.push(err);
	},
	match: function(sample, pattern, noint_pname) {
		var self = this;
		if(typeof noint_pname === 'undefined') noint_pnmame = false;
		var propertyName;
		if(typeof noint_pname === 'boolean') {
			propertyName = '<root>';
			self.interrupt = !noint_pname; 
			self.err = [];
			console.log('ROOT. Self interrupt is', self.interrupt, 'and self err is ', self.err);
		}
		else {
			propertyName = noint_pname;
			console.log('NEST. Property name is ', propertyName);
		}
		function doSinglePattern(p) {
			if(typeof p === 'string') {
				if(self.types.hasOwnProperty(p)) var typeHandler = self.types[p].bind(self), props = {};
				else this.drop({property: propertyName, errtype: 'unknown_type'});
			}
			else var typeHandler = self.types[p.type].bind(self), props = p;
			typeHandler(sample, props, propertyName);
		};
		// pattern may be an array for a polymorphic type
		if(pattern instanceof Array) {
			var oneSuccess = false, poly_err = [];
			iter(pattern, function(poly_option) {
				if(!oneSuccess) {
					try {
						doSinglePattern(poly_option);
						oneSuccess = true;		
					}
					catch(e) {
						poly_err.push(e);
					}					
				}
			})
			if(!oneSuccess) this.drop({property: prop, errtype: 'all_poly_options_failed', data: polyErr});
		}
		else {
			doSinglePattern(pattern);
		}
		return this.err;
	},
	types: {
		object: function(sample, pattern, propertyName) {
			var propNamePrefix = (propertyName !== '<root>') ? propertyName+' > ' : '';
			var match = this.match.bind(this);
			iter_obj(pattern.props, function(prop, directives) {
				if(!sample.hasOwnProperty(prop) && !directives.optional)
					this.drop({property: prop, errtype: 'prop_nonexist'});
				else if(sample.hasOwnProperty(prop)) {
					match(sample[prop], directives, propNamePrefix+prop);
				}
			})
		},
		json: function(sample, pattern, propertyName) {
			try { var parsed = JSON.parse(sample); }
			catch(e) { this.drop({property: propertyName, errtype: 'jsonparse_failed', original_error: e} ) }
			this.types.object.bind(this)(parsed, pattern, propertyName);
		},
		string: function(sample, pattern, prop) {
			if(typeof sample !== 'string') this.drop({property: prop, errtype: 'wrong_type'});
			if(pattern.hasOwnProperty('size')) {
				if(pattern.size instanceof Array && pattern.size.length === 2) {
					if(sample.length < pattern.size[0]) this.drop({property: prop, errtype: 'toosmall'});
					if(sample.length > pattern.size[1]) this.drop({property: prop, errtype: 'toobig'});
				}
				else if(sample.length !== pattern.size) this.drop({property: prop, errtype: 'size_notequal'});
			}
			if(pattern.hasOwnProperty('whitelist') && !in_array(sample, pattern.whitelist)) this.drop({property: prop, errtype: 'not_in_whitelist'});
			if(pattern.hasOwnProperty('partial_blacklist')) {
				iter(pattern.partial_blacklist, function(entry) {
					if(sample.indexOf(entry) !== (-1)) this.drop({property: prop, errtype: 'blacklisted_fragment', fragment: entry });
				})
			}
			if(pattern.hasOwnProperty('blacklist') && in_array(sample, pattern.blacklist)) this.drop({property: prop, errtype: 'in_blacklist'});
			if(pattern.hasOwnProperty('equals') && sample !== pattern.equals) this.drop({property: prop, errtype: 'not_equals'});
			if(pattern.hasOwnProperty('regex') && !(pattern.regex.test(sample))) this.drop({property: prop, errtype: 'regex_failed'});
		}
	}
}
