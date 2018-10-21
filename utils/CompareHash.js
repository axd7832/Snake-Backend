//bcrypt 
const bcrypt = require('bcrypt')

function compareHash(hashAttemp,dbHash) {
  bcrypt.compare(hashAttemp,dbHash, function(err, res) {
    if (err) return err
    return res
  })
}
module.exports = compareHash