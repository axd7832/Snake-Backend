//jwt auth
const jwt = require('jsonwebtoken')
const routes = require('express').Router()
const bcrypt = require('bcrypt')
// Validation | Sanitization
var striptags = require('striptags') // https://www.npmjs.com/package/striptags

// Mongoose Schemas
const User = require('../models/User')
// hash passoword 
const Hash = require('../utils/Hash')
// route protecter
// not currently used - used WS for most requests that could be get/post
// leaving in incase future routes need to be protected.
const protectRoute = require('../utils/ProtectRoute')

routes.post('/api/register', (req, res) => {
  var username = req.body.username;
  var passwordToHash = req.body.password;

  //strip HTML tags
  username = striptags(username)
  password = striptags(passwordToHash)
  // Hash the password
  Hash(passwordToHash).then(hashedPass => {
      var userAccount = new User({
        username: username,
        role: 'player',
        hash: hashedPass
      })
      // Send a response to the user
      userAccount.save( (err) => {
        if(err) {
          res.status(400).json({message: "Username taken."})
        } else{
          res.status(200).json({message: 'Account Created'})
        }
      })
  }).catch(err => {
    res.status(400).json({message:'Error Creating Account'})
  })
})

routes.post("/api/login", (req,res) => {
  //validate user input 
  var username = req.body.username
  var password = req.body.password
  // Strip Tags
  username = striptags(username)
  password = striptags(password)

  // Find a user and then check the passwork with bcrypt
  var queryPromise = User.findOne({username: username}).exec()
  queryPromise.then((foundUser) => {
    var user = {
      username: foundUser.username, 
      role: foundUser.role
    }
    // Uses bcrypt to compare the string hash to the foundUser hash
    bcrypt.compare(password, foundUser.hash, (err, isMatch) => {
      if (err) res.status(400).json({message: 'Invalid Credentials'}) 
      else if (isMatch) {
        // if its a match, then sign the token with the token secret
        user.token = jwt.sign({user}, process.env.TOKEN_SECRET)
        res.status(200).json({user})
      }
      else res.status(400).json({message: 'Invalid Credentials'}) 
    })
  })
    .catch((err) => {
      res.status(400).json({message:'Invalid Credentials'})
    })
}) 

module.exports = routes