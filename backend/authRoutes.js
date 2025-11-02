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
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/'); // On success, redirect to the homepage. Frontend will handle the rest.
    }
);

router.get('/logout', (req, res, next) => {
    // As of passport@0.6.0, req.logout() is now an asynchronous function.
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
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