//bcrypt 
const bcrypt = require('bcrypt')
const saltRounds = parseInt(process.env.SALT_ROUNDS)

function hash(pass) {
  return new Promise((resolve,reject) => {
    bcrypt.genSalt(12, function(err, salt) {
      bcrypt.hash(pass, salt, function(err, hash) {
        if (err) reject(err)
        else {
          resolve(hash)     
        }     
      })
    })
  })
}
module.exports = hash