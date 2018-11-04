//login
const passport = require('passport')
const passport_jwt = require('passport-jwt')
//jwt auth
const jwt_strategy = passport_jwt.Strategy
const extract_jwt = passport_jwt.ExtractJWT
const jwt = require('jsonwebtoken')
const routes = require('express').Router()
const bcrypt = require('bcrypt')
// Validation | Sanitization
var striptags = require('striptags') // https://www.npmjs.com/package/striptags

//Mongoose Schemas
const User = require('../models/User')
//hash passoword 
const Hash = require('../utils/Hash')
const compareHash = require('../utils/CompareHash')
//route protecter
const protectRoute = require('../utils/ProtectRoute')

routes.post('/api/register', (req, res) => {
  //TOOO write sanitation and validations for username and password
  var username = req.body.username;
  var passwordToHash = req.body.password;

  //strip HTML tags
  username = striptags(username)
  password = striptags(passwordToHash)


  console.log(`${username} ${passwordToHash}`)
  Hash(passwordToHash).then(hashedPass => {
      var userAccount = new User({
        username: username,
        role: 'player',
        hash: hashedPass
      })
      userAccount.save( (err) => {
        if(err) {
          res.status(400).json({message: "Username taken."})
          console.log(err)
        } else{
          res.status(200).json({message: 'Account Created'})
        }
      })
  }).catch(err => {
    res.status(400).json({message:'Error Creating Account'})
  })
})

routes.post("/api/login", (req,res) => {
  console.log(req.body)
  //validate user input 
  var username = req.body.username
  var password = req.body.password
  // Strip Tags

  username = striptags(username)
  password = striptags(password)


  var queryPromise = User.findOne({username: username}).exec()
  queryPromise.then((foundUser) => {
    var user = {
      username: foundUser.username, 
      role: foundUser.role
    }
    bcrypt.compare(password, foundUser.hash, (err, isMatch) => {
      if (err) res.status(400).json({message: 'Invalid Credentials'}) 
      else if (isMatch) {
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