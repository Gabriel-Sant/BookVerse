const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const DATA_FILE = path.join(__dirname, 'data.json');
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

async function readData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const initial = {
        authors: [],
        books: [],
        users: [],
        categories: [],
        publishers: [],
        reviews: [],
        orders: [],
        coupons: []
      };
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

// --- MÓDULO AUTOR (RF03) ---

// [RF03.1] Criar Autor
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

// [RF03.2] Consultar Autores
app.get('/authors', async (req, res) => {
  const data = await readData();
  res.json(data.authors);
});

// [RF03.2] Consultar Autor por ID
app.get('/authors/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const auth = data.authors.find(a => a.id === id);
  if (!auth) return res.status(404).json({ error: 'Autor não encontrado' });
  res.json(auth);
});

// [RF03.3] Atualizar Autor
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

// [RF03.4] Excluir Autor
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

// --- MÓDULO LIVRO (RF02) ---

// [RF02.1] Criar Livro
app.post('/books', async (req, res) => {
  try {
    const { title, description, price, file, authorId, categoryId, publisherId } = req.body;
    if (!isValidString(title)) return res.status(400).json({ error: 'Título é obrigatório.' });
    if (!isValidPrice(price)) return res.status(400).json({ error: 'Preço inválido (número >= 0).' });
    if (!isValidString(authorId)) return res.status(400).json({ error: 'authorId é obrigatório.' });

    const data = await readData();
    const author = data.authors.find(a => a.id === authorId);
    if (!author) return res.status(400).json({ error: 'Autor não encontrado (authorId inválido).' });

    if (publisherId) {
      const publisher = data.publishers.find(p => p.id === publisherId);
      if (!publisher) return res.status(400).json({ error: 'Editora não encontrada.' });
    }

    const newBook = {
      id: uuidv4(),
      title: title.trim(),
      description: description ? String(description).trim() : '',
      price: Number(price),
      file: file || null,
      authorId,
      categoryId: categoryId || null,
      publisherId: publisherId || null,
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

// [RF02.2] Consultar Livros
app.get('/books', async (req, res) => {
  const { expand } = req.query;
  const data = await readData();
  let books = data.books;

  if (expand) {
    books = books.map(b => {
      const author = expand.includes('author') ? (data.authors.find(a => a.id === b.authorId) || null) : undefined;
      const category = expand.includes('category') ? (data.categories.find(c => c.id === b.categoryId) || null) : undefined;
      const publisher = expand.includes('publisher') ? (data.publishers.find(p => p.id === b.publisherId) || null) : undefined;
      return { ...b, ...(author && { author }), ...(category && { category }), ...(publisher && { publisher }) };
    });
  }
  res.json(books);
});

// [RF02.2] Consultar Livro por ID
app.get('/books/:id', async (req, res) => {
  const { id } = req.params;
  const { expand } = req.query;
  const data = await readData();
  let book = data.books.find(b => b.id === id);
  if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

  if (expand) {
    const author = expand.includes('author') ? (data.authors.find(a => a.id === book.authorId) || null) : undefined;
    const category = expand.includes('category') ? (data.categories.find(c => c.id === book.categoryId) || null) : undefined;
    const publisher = expand.includes('publisher') ? (data.publishers.find(p => p.id === book.publisherId) || null) : undefined;
    book = { ...book, ...(author && { author }), ...(category && { category }), ...(publisher && { publisher }) };
  }
  res.json(book);
});

// [RF02.3] Atualizar Livro
app.put('/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, file, authorId, categoryId, publisherId } = req.body;
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
    if (categoryId !== undefined) {
      if (categoryId && !isValidString(categoryId)) return res.status(400).json({ error: 'categoryId inválido.' });
      const categoryExists = categoryId ? data.categories.some(c => c.id === categoryId) : true;
      if (!categoryExists) return res.status(400).json({ error: 'Categoria não encontrada (categoryId inválido).' });
      data.books[idx].categoryId = categoryId || null;
    }
    if (publisherId !== undefined) {
      if (publisherId && !isValidString(publisherId)) return res.status(400).json({ error: 'publisherId inválido.' });
      const publisherExists = publisherId ? data.publishers.some(p => p.id === publisherId) : true;
      if (!publisherExists) return res.status(400).json({ error: 'Editora não encontrada.' });
      data.books[idx].publisherId = publisherId || null;
    }

    data.books[idx].updatedAt = new Date().toISOString();
    await writeData(data);
    res.json(data.books[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF02.4] Excluir Livro
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

// --- MÓDULO USUÁRIO (RF01) ---

// [RF01.1] Cadastrar Usuário
app.post('/users', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!isValidString(name) || !isValidString(email) || !isValidString(password)) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    const data = await readData();
    const emailExists = data.users.some(u => u.email === email.trim());
    if (emailExists) return res.status(400).json({ error: 'E-mail já cadastrado.' });

    const newUser = {
      id: uuidv4(),
      name: name.trim(),
      email: email.trim(),
      password,
      createdAt: new Date().toISOString()
    };
    data.users.push(newUser);
    await writeData(data);
    const { password: _, ...safeUser } = newUser;
    return res.status(201).json(safeUser);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF01.2] Consultar Usuários
app.get('/users', async (req, res) => {
  const data = await readData();
  const safeUsers = data.users.map(({ password: _, ...user }) => user);
  res.json(safeUsers);
});

// [RF01.2] Consultar Usuário por ID
app.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const user = data.users.find(u => u.id === id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  const { password: _, ...safeUser } = user;
  res.json(safeUser);
});

// [RF01.3] Atualizar Usuário
app.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;
    const data = await readData();
    const idx = data.users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (name !== undefined) {
      if (!isValidString(name)) return res.status(400).json({ error: 'Nome inválido' });
      data.users[idx].name = name.trim();
    }
    if (email !== undefined) {
      if (!isValidString(email)) return res.status(400).json({ error: 'E-mail inválido' });
      const emailExists = data.users.some((u, i) => i !== idx && u.email === email.trim());
      if (emailExists) return res.status(400).json({ error: 'E-mail já cadastrado para outro usuário.' });

      data.users[idx].email = email.trim();
    }
    if (password !== undefined) data.users[idx].password = password;

    data.users[idx].updatedAt = new Date().toISOString();
    await writeData(data);

    const { password: _, ...safeUser } = data.users[idx];
    res.json(safeUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF01.4] Excluir Usuário
app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();

    const usedInBook = data.books.some(b => b.authorId === id);
    if (usedInBook) return res.status(400).json({ error: 'Usuário possui registros associados (Livros) e não pode ser excluído.' });

    const newUsers = data.users.filter(u => u.id !== id);
    if (newUsers.length === data.users.length) return res.status(404).json({ error: 'Usuário não encontrado' });

    data.users = newUsers;
    await writeData(data);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// --- MÓDULO CATEGORIA (RF04) ---

// [RF04.1] Criar Categoria
app.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!isValidString(name)) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });

    const data = await readData();
    const newCategory = {
      id: uuidv4(),
      name: name.trim(),
      createdAt: new Date().toISOString()
    };
    data.categories.push(newCategory);
    await writeData(data);
    return res.status(201).json(newCategory);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF04.2] Consultar Categorias
app.get('/categories', async (req, res) => {
  const data = await readData();
  res.json(data.categories);
});

// [RF04.2] Consultar Categoria por ID
app.get('/categories/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const cat = data.categories.find(c => c.id === id);
  if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
  res.json(cat);
});

// [RF04.3] Atualizar Categoria
app.put('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const data = await readData();
    const idx = data.categories.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Categoria não encontrada' });

    if (name !== undefined) {
      if (!isValidString(name)) return res.status(400).json({ error: 'Nome inválido' });
      data.categories[idx].name = name.trim();
    }

    data.categories[idx].updatedAt = new Date().toISOString();
    await writeData(data);
    res.json(data.categories[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF04.4] Excluir Categoria
app.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();

    const usedByBook = data.books.some(b => b.categoryId === id);
    if (usedByBook) return res.status(400).json({ error: 'Categoria está associada a um livro e não pode ser excluída.' });

    const newCategories = data.categories.filter(c => c.id !== id);
    if (newCategories.length === data.categories.length) return res.status(404).json({ error: 'Categoria não encontrada' });

    data.categories = newCategories;
    await writeData(data);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// --- MÓDULO EDITORA (RF05) ---

// [RF05.1] Criar Editora
app.post('/publishers', async (req, res) => {
  try {
    const { name, foundationYear } = req.body;
    if (!isValidString(name)) return res.status(400).json({ error: 'Nome da editora é obrigatório.' });

    const data = await readData();
    const newPublisher = {
      id: uuidv4(),
      name: name.trim(),
      foundationYear: foundationYear ? Number(foundationYear) : null,
      createdAt: new Date().toISOString()
    };
    data.publishers.push(newPublisher);
    await writeData(data);
    return res.status(201).json(newPublisher);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF05.2] Consultar Editoras
app.get('/publishers', async (req, res) => {
  const data = await readData();
  res.json(data.publishers);
});

// [RF05.2] Consultar Editora por ID
app.get('/publishers/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const pub = data.publishers.find(p => p.id === id);
  if (!pub) return res.status(404).json({ error: 'Editora não encontrada' });
  res.json(pub);
});

// [RF05.3] Atualizar Editora
app.put('/publishers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, foundationYear } = req.body;
    const data = await readData();
    const idx = data.publishers.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Editora não encontrada' });

    if (name !== undefined) {
      if (!isValidString(name)) return res.status(400).json({ error: 'Nome inválido' });
      data.publishers[idx].name = name.trim();
    }
    if (foundationYear !== undefined) data.publishers[idx].foundationYear = Number(foundationYear);

    data.publishers[idx].updatedAt = new Date().toISOString();
    await writeData(data);
    res.json(data.publishers[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF05.4] Excluir Editora
app.delete('/publishers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();

    const usedByBook = data.books.some(b => b.publisherId === id);
    if (usedByBook) return res.status(400).json({ error: 'Editora está associada a um livro e não pode ser excluída.' });

    const newPublishers = data.publishers.filter(p => p.id !== id);
    if (newPublishers.length === data.publishers.length) return res.status(404).json({ error: 'Editora não encontrada' });

    data.publishers = newPublishers;
    await writeData(data);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// --- MÓDULO AVALIAÇÃO (RF06) ---

// [RF06.1] Criar Avaliação
app.post('/reviews', async (req, res) => {
  try {
    const { userId, bookId, rating, comment } = req.body;
    if (!isValidString(userId) || !isValidString(bookId)) return res.status(400).json({ error: 'userId e bookId são obrigatórios.' });
    if (typeof rating !== 'number' || rating < 1 || rating > 5) return res.status(400).json({ error: 'Avaliação deve ser um número entre 1 e 5.' });

    const data = await readData();
    const userExists = data.users.some(u => u.id === userId);
    const bookExists = data.books.some(b => b.id === bookId);
    if (!userExists || !bookExists) return res.status(400).json({ error: 'Usuário ou Livro não encontrado.' });

    const newReview = {
      id: uuidv4(),
      userId,
      bookId,
      rating,
      comment: comment ? String(comment).trim() : '',
      createdAt: new Date().toISOString()
    };
    data.reviews.push(newReview);
    await writeData(data);
    return res.status(201).json(newReview);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF06.2] Consultar Avaliações
app.get('/reviews', async (req, res) => {
  const { expand } = req.query;
  const data = await readData();
  let reviews = data.reviews;
  if (expand) {
    reviews = reviews.map(r => {
      const user = expand.includes('user') ? (data.users.find(u => u.id === r.userId) || null) : undefined;
      const book = expand.includes('book') ? (data.books.find(b => b.id === r.bookId) || null) : undefined;
      if (user) { const { password: _, ...safeUser } = user; user.password = undefined; Object.assign(user, safeUser); }
      return { ...r, ...(user && { user }), ...(book && { book }) };
    });
  }
  res.json(reviews);
});

// [RF06.2] Consultar Avaliação por ID
app.get('/reviews/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const review = data.reviews.find(r => r.id === id);
  if (!review) return res.status(404).json({ error: 'Avaliação não encontrada' });
  res.json(review);
});

// [RF06.3] Atualizar Avaliação
app.put('/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const data = await readData();
    const idx = data.reviews.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Avaliação não encontrada' });

    if (rating !== undefined) {
      if (typeof rating !== 'number' || rating < 1 || rating > 5) return res.status(400).json({ error: 'Avaliação inválida.' });
      data.reviews[idx].rating = rating;
    }
    if (comment !== undefined) data.reviews[idx].comment = String(comment).trim();

    data.reviews[idx].updatedAt = new Date().toISOString();
    await writeData(data);
    res.json(data.reviews[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF06.4] Excluir Avaliação
app.delete('/reviews/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();
    const newReviews = data.reviews.filter(r => r.id !== id);
    if (newReviews.length === data.reviews.length) return res.status(404).json({ error: 'Avaliação não encontrada' });
    data.reviews = newReviews;
    await writeData(data);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// --- MÓDULO PEDIDO (RF07) ---

// [RF07.1] Criar Pedido
app.post('/orders', async (req, res) => {
  try {
    const { userId, items } = req.body;
    if (!isValidString(userId)) return res.status(400).json({ error: 'userId é obrigatório.' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Itens do pedido são obrigatórios.' });

    const data = await readData();
    const userExists = data.users.some(u => u.id === userId);
    if (!userExists) return res.status(400).json({ error: 'Usuário não encontrado.' });

    let total = 0;
    for (const item of items) {
      const book = data.books.find(b => b.id === item.bookId);
      if (!book) return res.status(400).json({ error: `Livro ${item.bookId} não encontrado.` });
      total += book.price * (item.quantity || 1);
    }

    const newOrder = {
      id: uuidv4(),
      userId,
      items,
      total,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    data.orders.push(newOrder);
    await writeData(data);
    return res.status(201).json(newOrder);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF07.2] Consultar Pedidos
app.get('/orders', async (req, res) => {
  const data = await readData();
  res.json(data.orders);
});

// [RF07.2] Consultar Pedido por ID
app.get('/orders/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const order = data.orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json(order);
});

// [RF07.3] Atualizar Pedido
app.put('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (status !== undefined) {
      if (!isValidString(status)) return res.status(400).json({ error: 'Status inválido' });
      data.orders[idx].status = status.trim();
    }

    data.orders[idx].updatedAt = new Date().toISOString();
    await writeData(data);
    res.json(data.orders[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF07.4] Excluir Pedido
app.delete('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();
    const newOrders = data.orders.filter(o => o.id !== id);
    if (newOrders.length === data.orders.length) return res.status(404).json({ error: 'Pedido não encontrado' });
    data.orders = newOrders;
    await writeData(data);
    res.status(204).send();
  } catch (err) {
    const { code, discountPercentage } = req.body;
    if (!isValidString(code)) return res.status(400).json({ error: 'Código do cupom é obrigatório.' });
    if (typeof discountPercentage !== 'number' || discountPercentage <= 0 || discountPercentage > 100) {
      return res.status(400).json({ error: 'Porcentagem de desconto inválida.' });
    }

    const data = await readData();
    const newCoupon = {
      id: uuidv4(),
      code: code.trim().toUpperCase(),
      discountPercentage,
      createdAt: new Date().toISOString()
    };
    data.coupons.push(newCoupon);
    await writeData(data);
    return res.status(201).json(newCoupon);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF08.2] Consultar Cupons
app.get('/coupons', async (req, res) => {
  const data = await readData();
  res.json(data.coupons);
});

// [RF08.2] Consultar Cupom por ID
app.get('/coupons/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData();
  const coupon = data.coupons.find(c => c.id === id);
  if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });
  res.json(coupon);
});

// [RF08.3] Atualizar Cupom
app.put('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discountPercentage } = req.body;
    const data = await readData();
    const idx = data.coupons.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Cupom não encontrado' });

    if (code !== undefined) {
      if (!isValidString(code)) return res.status(400).json({ error: 'Código inválido' });
      data.coupons[idx].code = code.trim().toUpperCase();
    }
    if (discountPercentage !== undefined) {
      if (typeof discountPercentage !== 'number' || discountPercentage <= 0 || discountPercentage > 100) {
        return res.status(400).json({ error: 'Porcentagem de desconto inválida.' });
      }
      data.coupons[idx].discountPercentage = discountPercentage;
    }

    data.coupons[idx].updatedAt = new Date().toISOString();
    await writeData(data);
    res.json(data.coupons[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// [RF08.4] Excluir Cupom
app.delete('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();
    const newCoupons = data.coupons.filter(c => c.id !== id);
    if (newCoupons.length === data.coupons.length) return res.status(404).json({ error: 'Cupom não encontrado' });
    data.coupons = newCoupons;
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