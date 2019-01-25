const express = require('express');
const loki = require('lokijs');
const bodyParser = require('body-parser');
const uuid = require('uuid/v5');
const uuidv4 = require('uuid/v4');
const _ = require('lodash');

const app = express();
const port = process.env.PORT || 3000;
const db = new loki('data.db', {
  autosave: true,
});

const MOVIE_NAMESPACE = '82f3d365-44e5-4c9e-9d40-ebd2e43aa477';
const CRITERIA_NAMESPACE = '5449a322-51b4-4199-b52a-08d86e868be1';

// Set of tables
const table = {
  criteria: db.addCollection('criteria'),
  movies: db.addCollection('movies'),
  matchingCriteria: db.addCollection('matching-criteria'),
  boards: db.addCollection('boards'),
};

function calcBingo(id) {
  // Create an object showing which criteria are selected for this movie
  const entries = table.matchingCriteria
    .find({ movie: id })
    .reduce((obj, {id}) => ({...obj, [id]: true}), {});

  // Convert the board into winning, selected, and id
  const boards = table.boards
    .find({ movie: id })
    .map(board => ({
      id: board.id,
      board: board.board.map(cid => ({
        selected: cid === 'free' || !!entries[cid],
        winner: false,
        name: cid === 'free' ?
          'Free' :
          (table.criteria.findOne({id: cid}) || {$loki: '[redacted]'}).$loki
      })),
    }));


  // Determine wins for diag, rows, cols
  for(const obj of boards) {
    const board = _.chunk(obj.board, 5);
    const diagNW = _.range(5).map(i => board[i][i]);
    if(diagNW.every(c => c.selected)) {
      for (const c of diagNW) {
        c.winner = true;
      }
    }
    const diagNE = _.range(5).map(i => board[i][4-i]);
    if(diagNE.every(c => c.selected)) {
      for (const c of diagNE) {
        c.winner = true;
      }
    }
    for(let j = 0; j < 5; j++) {
      const row = _.range(5).map(i => board[0][i]);
      if(row.every(c => c.selected)) {
        for (const c of row) {
          c.winner = true;
        }
      }
      const col = _.range(5).map(i => board[i][0]);
      if(col.every(c => c.selected)) {
        for (const c of col) {
          c.winner = true;
        }
      }
    }
  }
  return boards;
}

app.set('view engine', 'pug');
// app.engine('pug', require('pug').__express);
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }))

app.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});

app.get('/', (req, res) => res.render('home', {
  page: {
    title: 'Home',
    name: 'home',
  },
}));

app.get('/movies', (req, res) => {
  res.render('movies', {
    page: {
      title: 'Movies',
      name: 'movies',
    },
    movies: table.movies.find(),
  });
});

app.get('/movies/new', (req, res) => {
  res.render('new_movie', {
    page: {
      title: 'New Movie',
      name: 'new movie',
    },
    criteria: table.criteria.find(),
  });
});

app.post('/movies/new', (req, res) => {
  const { title, 'criteria[]': selected } = req.body;
  const date = Date.now();
  const id = uuid(title, MOVIE_NAMESPACE);

  // Redirect if this movie already exists
  if(table.movies.findOne({ id })) {
    return res.redirect('/movies/' + id);
  }

  // Create the movie
  table.movies.insert({ title, id, selected, date });

  res.redirect('/movies/' + id);
});

app.get('/movies/:id', (req, res) => {
  const { id } = req.params;
  const movie = table.movies.findOne({ id });

  if(!movie) {
    return res.status(404).render('404', {
      page: {
        title: 'Not Found',
        name: '404',
      }
    });
  }

  const criteria = table.criteria.find()

  // Determine which criteria have been selected
  const entries = table.matchingCriteria
    .find({ movie: id })
    .reduce((obj, {id}) => ({...obj, [id]: true}), {});
  criteria.forEach(c => c.selected = !!entries[c.id]);

  const boards = calcBingo(id);

  res.render('movie', {
    page: {
      title: 'Movie - ' + movie.title,
      name: 'movies',
    },
    movie,
    criteria,
    boards,
  });
});

app.post('/movies/:id/boards/new', (req, res) => {
  const { id } = req.params;
  const movie = table.movies.findOne({ id });

  if(!movie) {
    return res.status(404).render('404', {
      page: {
        title: 'Not Found',
        name: '404',
      }
    });
  }

  const board = _.shuffle(movie.selected);
  // Insert free tile into the middle
  board.splice(12, 0, 'free');

  table.boards.insert({
    id: uuidv4(),
    movie: id,
    board,
  });

  res.redirect('/movies/' + id);
});

app.post('/movies/:id/toggle/:cid', (req, res) => {
  const { id, cid } = req.params;
  const movie = table.movies.findOne({ id });
  const criteria = table.criteria.findOne({ id: cid });

  if(!movie || !criteria) {
    return res.status(404).render('404', {
      page: {
        title: 'Not Found',
        name: '404',
      }
    });
  }

  const entry = table.matchingCriteria.findOne({ movie: id, id: cid });

  // Remove it if it exists, insert it if it doesn't
  if(entry) {
    table.matchingCriteria.findAndRemove({
      movie: {'$eq': id},
      id: {'$eq': cid}
    });
  } else {
    table.matchingCriteria.insert({ movie: id, id: cid });    
  }

  res.redirect('/movies/' + id);
});

app.post('/movies/:movie/boards/:id/delete', (req, res) => {
  const { movie, id } = req.params;
  const board = table.boards.findOne({ movie, id });

  if(!board) {
    return res.status(404).render('404', {
      page: {
        title: 'Not Found',
        name: '404',
      }
    });
  }

  table.boards.findAndRemove({'id': {'$eq': id}, 'movie': {'$eq': movie}});

  res.redirect('/movies/' + movie);
});


app.post('/movies/:id/delete', (req, res) => {
  const { id } = req.params;
  const movie = table.movies.findOne({ id });

  if(!movie) {
    return res.status(404).render('404', {
      page: {
        title: 'Not Found',
        name: '404',
      }
    });
  }

  table.movies.findAndRemove({'id': {'$eq': id}});

  res.redirect('/movies/');
});


app.get('/criteria', (req, res) => {
  res.render('criteria', {
    page: {
      title: 'Criteria',
      name: 'criteria',
    },
    criteria: table.criteria.find(),
  });
});

app.post('/criteria', (req, res) => {
  const { name } = req.body;
  const id = uuid(name, CRITERIA_NAMESPACE);

  if(!table.criteria.findOne({ id })) {
    table.criteria.insert({ name, id });
  }

  res.redirect('/criteria');
});

app.post('/criteria/:id/delete', (req, res) => {
  table.criteria.findAndRemove({'id': {'$eq': req.params.id}})

  res.redirect('/criteria');
});

app.use((req, res) => {
    res.status(404).render('404', {
      page: {
        title: 'Not Found',
        name: '404',
      }
    });
});

app.listen(port, () => console.log(`Started server on :${port}!`));
