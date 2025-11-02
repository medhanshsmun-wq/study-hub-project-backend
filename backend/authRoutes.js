const passport = require('passport');
const mongoose = require('mongoose');
const express = require('express');
require('./User'); // Ensure the User model is loaded
const User = mongoose.model('users');

const router = express.Router();

router.get(
    '/auth/google',
    passport.authenticate('google', {
        scope: ['profile', 'email']
    })
);

router.get(
    '/auth/callback/google',
    passport.authenticate('google', {
        successRedirect: process.env.FRONTEND_URL, // Redirect to frontend on success
        failureRedirect: `${process.env.FRONTEND_URL}/login?error=true` // Redirect to frontend on failure
    })
);

router.get('/logout', (req, res, next) => {
    // As of passport@0.6.0, req.logout() is now an asynchronous function.
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect(process.env.FRONTEND_URL);
    });
});

router.get('/current_user', (req, res) => {
    res.json(req.user || null);
});

router.post('/profile', async (req, res) => {
    if (!req.user) {
        return res.status(401).send({ error: 'You must be logged in!' });
    }
    try {
        const user = await User.findByIdAndUpdate(req.user.id, { displayName: req.body.displayName, branch: req.body.branch, year: req.body.year }, { new: true });
        res.send(user);
    } catch (error) {
        res.status(500).send({ error: 'Failed to update profile.' });
    }
});

module.exports = router;