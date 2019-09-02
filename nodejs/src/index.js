const bodyParser = require('body-parser');
const session = require('cookie-session');
const engines = require('consolidate');
const express = require('express');
const multer = require('multer');
const fs = require('fs');

const { Client, InvalidRequest, Unauthorized } = require('base-api-io');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename(req, file, callback) {
    callback(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fieldNameSize: 100,
    fieldSize: 1000000,
    fileSize: 1000000,
  },
});

// APP SETUP
// =============================================================================

const app = express();

app.engine('ejs', engines.qejs);

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  name: 'session',
  secret: 'secret',
  cookie: {
    secure: false,
    httpOnly: true,
  },
}));

app.use((req, res, next) => {
  res.locals.loggedIn = !!req.session.userId;
  next();
});

const getErrorMessage = (error) => {
  if (error instanceof InvalidRequest) {
    return `Invalid request: ${error.data.error}`;
  } if (error instanceof Unauthorized) {
    return 'Unauthorized!';
  }
  return 'Something went wrong!';
};

// CREATE A CLIENT
// =============================================================================

const client = new Client('c8d4600b-6334-4b1c-8b5c-63722a923f60', "http://localhost:8080");

// REGISTER
// =============================================================================

app.get('/register', async (req, res) => {
  if (res.locals.loggedIn) {
    res.redirect('/');
  } else {
    res.render('register', {
      confirmation: "",
      custom_data: "",
      password: "",
      error: null,
      email: ""
    });
  }
});

app.post('/register', async (req, res) => {
  if (res.locals.loggedIn) {
    res.redirect('/');
  } else {
    try {
      const user = await client.users.create(
        req.body.email,
        req.body.password,
        req.body.confirmation,
        JSON.parse(req.body.custom_data)
      );

      req.session.userId = user.id;
      res.redirect(`/users/${user.id}`);
    } catch (error) {
      res.render('register', {
        error: getErrorMessage(error),
        confirmation: req.body.confirmation,
        custom_data: req.body.custom_data,
        password: req.body.password,
        email: req.body.email,
      });
    }
  }
});

// LOGIN
// =============================================================================

app.get('/login', async (req, res) => {
  if (res.locals.loggedIn) {
    res.redirect('/');
  } else {
    res.render('login', { error: null, email: "", password: "" });
  }
});

app.post('/login', async (req, res) => {
  if (res.locals.loggedIn) {
    res.redirect('/');
  } else {
    try {
      const user = await client.sessions.authenticate(req.body.email, req.body.password);

      req.session.userId = user.id;
      res.redirect(`/users/${user.id}`);
    } catch (error) {
      res.render('login', {
        error: getErrorMessage(error),
        password: req.body.password,
        email: req.body.email,
      });
    }
  }
});

// LOGOUT
// =============================================================================

app.get('/logout', async (req, res) => {
  req.session.userId = null;
  res.redirect('/');
});

// USER
// =============================================================================

app.get('/users', async (req, res) => {
  const page =
    req.query.page ? parseInt(req.query.page) : 1

  const data =
    await client.users.list(page);

  res.render('users', { data, page })
})

app.get('/users/:id', async (req, res) => {
  try {
    const user = await client.users.get(req.params.id);

    res.render('user', { user });
  } catch (error) {
    res.redirect('/users');
  }
});

app.get('/users/:id/update', async (req, res) => {
  try {
    const user = await client.users.get(req.params.id);

    res.render('update-user', {  error: null, id: req.params.id, email: user.email, custom_data: user.custom_data });
  } catch (error) {
    res.render('update-user', {  error: getErrorMessage(error), id: req.params.id, email: req.params.email, custom_data: req.params.custom_data });
  }
});

app.post('/users/:id', async (req, res) => {
  try {
    const user = await client.users.get(req.params.id);

    custom_data =
      (req.body.custom_data.trim() === "") ? null : JSON.parse(req.body.custom_data)

    await client.users.update(
      user.id,
      req.body.email,
      custom_data
    );

    res.redirect(`/users/${user.id}`);
  } catch (error) {
    res.render('update-user', {
      user: {
        custom_data: req.body.custom_data,
        email: req.body.email
      },
      error: getErrorMessage(error)
    });
  }
});

app.post('/users/:id/delete', async (req, res) => {
  try {
    await client.users.delete(req.params.id);

    if (req.params.id === req.session.userId) {
      req.session.userId = null;
    }

    res.redirect('/users');
  } catch (error) {
    res.redirect('/users');
  }
});

// SEND EMAIL
// =============================================================================

app.get('/send-email', async (req, res) => {
  res.render('send-email');
});

app.post('/send-email', async (req, res) => {
  try {
    await client.emails.send(
      req.body.subject,
      req.body.from,
      req.body.to,
      req.body.html,
      req.body.text,
    );

    res.render('send-email', { success: true });
  } catch (error) {
    res.render('send-email', {
      error: getErrorMessage(error),
      subject: req.body.subject,
      from: req.body.from,
      html: req.body.html,
      text: req.body.text,
      to: req.body.to,
    });
  }
});

// UPLOAD FILE
// =============================================================================

app.get('/upload-file', async (req, res) => {
  res.render('upload-file');
});

app.post('/upload-file', upload.single('file'), async (req, res) => {
  try {
    const file = await client.files.create({
      content_type: req.file.mimetype,
      file: req.file.path,
    });

    fs.unlink(req.file.path);

    res.redirect(`/files/${file.id}`);
  } catch (error) {
    res.render('upload-file', {
      error: getErrorMessage(error),
    });
  }
});

// FILE
// =============================================================================

app.get('/files', async (req, res) => {
  const page =
    req.query.page ? parseInt(req.query.page) : 1

  const data =
    await client.files.list(page);

  res.render('files', { data, page })
})

app.get('/files/:id', async (req, res) => {
  try {
    const file = await client.files.get(req.params.id);

    res.render('file', { file });
  } catch (error) {
    res.redirect('/files');
  }
});

app.post('/files/:id/delete', async (req, res) => {
  try {
    await client.files.delete(req.params.id);

    res.redirect('/files');
  } catch (error) {
    res.redirect('/files');
  }
});

// UPLOAD IMAGE
// =============================================================================

app.get('/images', async (req, res) => {
  const page =
    req.query.page ? parseInt(req.query.page) : 1

  const data =
    await client.images.list(page);

  res.render('images', { data, page })
})

app.get('/upload-image', async (req, res) => {
  res.render('upload-image');
});

app.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    const image = await client.images.create({
      content_type: req.file.mimetype,
      file: req.file.path,
    });

    fs.unlink(req.file.path);

    res.redirect(`/images/${image.id}`);
  } catch (error) {
    res.render('upload-image', {
      error: getErrorMessage(error),
    });
  }
});

// IMAGE
// =============================================================================

app.get('/images/:id', async (req, res) => {
  try {
    const image = await client.images.get(req.params.id);

    res.render('image', { image });
  } catch (error) {
    res.redirect('/images');
  }
});

app.post('/images/:id/delete', async (req, res) => {
  try {
    await client.images.delete(req.params.id);

    res.redirect('/images');
  } catch (error) {
    res.redirect('/images');
  }
});

// HOME
// =============================================================================

app.get('/', async (req, res) => {
  res.render('index');
});

// MAILING LISTS
// =============================================================================

app.get('/mailing-lists', async (req, res) => {
  const page =
    req.query.page ? parseInt(req.query.page) : 1

  const data =
    await client.mailingLists.list(page);

  res.render('mailing-lists', { data, page })
})

app.get('/mailing-lists/:id', async (req, res) => {
  try {
    const list = await client.mailingLists.get(req.params.id);

    res.render('mailing-list', { list, client });
  } catch (error) {
    res.redirect('/mailing-lists');
  }
});

app.post('/mailing-lists/:id/subscribe', async (req, res) => {
  try {
    const list =
      await client.mailingLists.subscribe(req.params.id, req.body.email);

    res.redirect(`/mailing-lists/${req.params.id}`)
  } catch (error) {
    res.redirect('/mailing-lists');
  }
});

app.post('/mailing-lists/:id/unsubscribe', async (req, res) => {
  try {
    const list =
      await client.mailingLists.unsubscribe(req.params.id, req.body.email);

    res.redirect(`/mailing-lists/${req.params.id}`)
  } catch (error) {
    res.redirect('/mailing-lists');
  }
});

app.post('/mailing-lists/:id/send', async (req, res) => {
  try {
    const list =
      await client.mailingLists.send(
        req.params.id,
        req.body.subject,
        req.body.from,
        req.body.html,
        req.body.text)

    res.redirect(`/mailing-lists/${req.params.id}`)
  } catch (error) {
    res.redirect('/mailing-lists');
  }
});

app.listen(3000);
