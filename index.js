
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, 'data.json');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const initial = { authors: [], books: [] };
      await writeData(initial);
      return initial;
    }
    throw err;
  }
}

async function writeData(data) {
  
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function isValidString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function isValidPrice(v) {
  return typeof v === 'number' && v >= 0;
}

app.post('/authors', async (req, res) => {
  try {
    const { name, biography, nationality } = req.body;
    if (!isValidString(name)) return res.status(400).json({ error: 'Nome do autor é obrigatório.' });

    const data = await readData();
    const newAuthor = {
      id: uuidv4(),
      name: name.trim(),
      biography: biography ? String(biography).trim() : '',
      nationality: nationality ? String(nationality).trim() : null,
      createdAt: new Date().toISOString()
    };
    data.authors.push(newAuthor);
    await writeData(data);
    return res.status(201).json(newAuthor);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});


app.get('/authors', async (req, res) => {
  const data = await readData();
  res.json(data.authors);
});


app.get('/authors/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const auth = data.authors.find(a => a.id === id);
  if (!auth) return res.status(404).json({ error: 'Autor não encontrado' });
  res.json(auth);
});


app.put('/authors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, biography, nationality } = req.body;
    const data = await readData();
    const idx = data.authors.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Autor não encontrado' });

    if (name !== undefined) {
      if (!isValidString(name)) return res.status(400).json({ error: 'Nome inválido' });
      data.authors[idx].name = name.trim();
    }
    if (biography !== undefined) data.authors[idx].biography = String(biography).trim();
    if (nationality !== undefined) data.authors[idx].nationality = nationality ? String(nationality).trim() : null;

    data.authors[idx].updatedAt = new Date().toISOString();
    await writeData(data);
    res.json(data.authors[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});


app.delete('/authors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();
    
    const usedByBook = data.books.some(b => b.authorId === id);
    if (usedByBook) return res.status(400).json({ error: 'Autor está associado a um livro e não pode ser excluído.' });

    const newAuthors = data.authors.filter(a => a.id !== id);
    if (newAuthors.length === data.authors.length) return res.status(404).json({ error: 'Autor não encontrado' });

    data.authors = newAuthors;
    await writeData(data);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});



app.post('/books', async (req, res) => {
  try {
    const { title, description, price, file, authorId, categoryId } = req.body;
    if (!isValidString(title)) return res.status(400).json({ error: 'Título é obrigatório.' });
    if (!isValidPrice(price)) return res.status(400).json({ error: 'Preço inválido (número >= 0).' });
    if (!isValidString(authorId)) return res.status(400).json({ error: 'authorId é obrigatório.' });

    const data = await readData();
    const author = data.authors.find(a => a.id === authorId);
    if (!author) return res.status(400).json({ error: 'Autor não encontrado (authorId inválido).' });

    const newBook = {
      id: uuidv4(),
      title: title.trim(),
      description: description ? String(description).trim() : '',
      price: Number(price),
      file: file || null, 
      authorId,
      categoryId: categoryId || null,
      createdAt: new Date().toISOString()
    };
    data.books.push(newBook);
    await writeData(data);
    return res.status(201).json(newBook);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});


app.get('/books', async (req, res) => {
  const { expand } = req.query; 
  const data = await readData();
  let books = data.books;
  if (expand === 'author') {
    books = books.map(b => {
      const author = data.authors.find(a => a.id === b.authorId) || null;
      return { ...b, author };
    });
  }
  res.json(books);
});


app.get('/books/:id', async (req, res) => {
  const { id } = req.params;
  const { expand } = req.query;
  const data = await readData();
  const book = data.books.find(b => b.id === id);
  if (!book) return res.status(404).json({ error: 'Livro não encontrado' });
  if (expand === 'author') {
    const author = data.authors.find(a => a.id === book.authorId) || null;
    return res.json({ ...book, author });
  }
  res.json(book);
});


app.put('/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, file, authorId, categoryId } = req.body;
    const data = await readData();
    const idx = data.books.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Livro não encontrado' });

    if (title !== undefined) {
      if (!isValidString(title)) return res.status(400).json({ error: 'Título inválido' });
      data.books[idx].title = title.trim();
    }
    if (description !== undefined) data.books[idx].description = String(description).trim();
    if (price !== undefined) {
      if (!isValidPrice(price)) return res.status(400).json({ error: 'Preço inválido' });
      data.books[idx].price = Number(price);
    }
    if (file !== undefined) data.books[idx].file = file;
    if (authorId !== undefined) {
      if (!isValidString(authorId)) return res.status(400).json({ error: 'authorId inválido' });
      const authorExists = data.authors.some(a => a.id === authorId);
      if (!authorExists) return res.status(400).json({ error: 'Autor não encontrado (authorId inválido).' });
      data.books[idx].authorId = authorId;
    }
    if (categoryId !== undefined) data.books[idx].categoryId = categoryId || null;

    data.books[idx].updatedAt = new Date().toISOString();
    await writeData(data);
    res.json(data.books[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});


app.delete('/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();
    const newBooks = data.books.filter(b => b.id !== id);
    if (newBooks.length === data.books.length) return res.status(404).json({ error: 'Livro não encontrado' });
    data.books = newBooks;
    await writeData(data);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});


app.get('/health', (req, res) => res.json({ status: 'ok' }));


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BookVerse backend rodando na porta ${PORT}`);
});
