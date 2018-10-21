const jwt = require('jsonwebtoken')

function protectRoute (req, res, next) {
    //get the signed cookie from register
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') { // Authorization: Bearer g1jipjgi1ifjioj
      // Handle token presented as a Bearer token in the Authorization header
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.COOKIE_SECRET, (err, authData) => {
        if(err) res.status(403).send('Forbidden')
          //cookie set to req.token
          req.token = req.signedCookies['jwt']
      })
      next()
    } else {
      res.status(403).send('Forbidden')
    } 
  }

  module.exports = protectRoute