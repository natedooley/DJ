/* queue_manager.js
 * Backbone collection to manage queued_songs. Represents a user's queue.
 */

var winston = require('winston');
var _ = require('underscore');
var Backbone = require('backbone');
var queued_song_model = require('../../models/queued_song');
var QueuedSong = require('./queued_song');

module.exports = Backbone.Collection.extend({
  comparator: 'order',
  model: QueuedSong,

  initialize: function() {
    this.on('add', this.songAdded, this);
  },

  songAdded: function(queued_song) {
    queued_song.on('change:order', this.sort, this);
    queued_song.on('change', function() {
      this.trigger('songChanged', queued_song);
    }, this);
  },

  getNextSong: function() {
    return this.first();
  },

  addSongEntity: function(song_entity, callback) {
    var queued_song = new QueuedSong({
      song: song_entity,
      song_id: song_entity.id,
      user_id: this.user_id,
      order: this.length + 1
    });
    queued_song.on('save', function() {
      this.add(queued_song);
      callback(queued_song);
    }, this);
    queued_song.save();
  },

  updateSongOrder: function(queued_song_id, order) {
    var target_queued_song = this.get(queued_song_id);
    var original_order = target_queued_song.get('order');
    var moved_down = order > original_order; // directionally, not numerically

    if (order === original_order)
      return;

    this.forEach(function(queued_song) {
      if (
          !moved_down &&
          queued_song.id !== queued_song_id &&
          queued_song.get('order') >= order &&
          queued_song.get('order') < original_order) {
        queued_song.incrementOrder();
      } else if (
          moved_down &&
          queued_song.id !== queued_song_id &&
          queued_song.get('order') <= order &&
          queued_song.get('order') > original_order) {
        queued_song.decrementOrder();
      }
    });
    this.get(queued_song_id).set({ order: order });
  },

  sync: function(method, model) {
    if (!this.user_id) {
      winston.error('Can\'t fetch queue; no user_id set.');
      this.trigger('error', new Error('No user ID specified.'));
      return;
    }

    queued_song_model.QueuedSong.find({
      user_id: this.user_id
    }, _.bind(function(err, queued_songs) {
      this.reset();
      var songs_left = queued_songs.length;
      if (songs_left === 0) {
        this.trigger('load');
        return;
      }
      queued_songs.forEach(_.bind(function(queued_song) {

        // Because autoFetch doesn't seem to work (godammit), we'll manually
        // fetch the artwork file entity.
        queued_song.song.getArtwork(_.bind(function(err, artwork) {
          if (artwork && !err)
            queued_song.song.artwork = artwork;
          var new_queued_song = new QueuedSong({ entity: queued_song });
          this.add(new_queued_song);
          if (--songs_left <= 0) {
            this.trigger('load');
          }
        }, this));
      }, this));
    }, this));
  },

  toJSON: function() {
    var songs = [];

    this.models.forEach(function(queued_song) {
      songs.push(queued_song.toJSON());
    });

    return songs;
  }
});
