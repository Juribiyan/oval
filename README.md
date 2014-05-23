oval
====

Pattern matching for Javascript with plain and simple syntax for validation of user input and APIs.

This is a work in progress.

##Usage##

    oval.match({
    	sz2: '12', 
    	sz3: '123',
    	sz4: '1234'
    }, 
    {	type: 'object', 
    	props: {
    		sz2: {
    			type: 'string', size: 2
    		},
    		sz3: {
    			type: 'string', size: 3
    		},
    		sz4: {
    			type: 'string', size: 4
    		}
    	}
    });
