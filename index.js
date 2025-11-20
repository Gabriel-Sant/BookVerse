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
      // Incluindo os novos arrays vazios para Usuários e Categorias
      const initial = { authors: [], books: [], users: [], categories: [] };
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

// --- MÓDULO AUTOR (CRUD COMPLETO) - JÁ EXISTENTE ---
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
    
    // Regra de Negócio: Autor não pode ser excluído se estiver associado a um livro.
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


// --- MÓDULO LIVRO (CRUD COMPLETO) - JÁ EXISTENTE ---
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
  // Adiciona 'category' no expand, se solicitado
  if (expand === 'category' || expand === 'author,category') {
      books = books.map(b => {
          const category = data.categories.find(c => c.id === b.categoryId) || null;
          return { ...b, category };
      });
  }
  res.json(books);
});


app.get('/books/:id', async (req, res) => {
  const { id } = req.params;
  const { expand } = req.query;
  const data = await readData();
  let book = data.books.find(b => b.id === id);
  if (!book) return res.status(404).json({ error: 'Livro não encontrado' });
  
  if (expand === 'author' || expand === 'category' || expand === 'author,category') {
    // Implementa o expand para autor e categoria na rota GET /books/:id
    const author = data.authors.find(a => a.id === book.authorId) || null;
    const category = data.categories.find(c => c.id === book.categoryId) || null;
    book = { ...book, author, category };
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
    if (categoryId !== undefined) {
        if (categoryId && !isValidString(categoryId)) return res.status(400).json({ error: 'categoryId inválido.' });
        const categoryExists = categoryId ? data.categories.some(c => c.id === categoryId) : true;
        if (!categoryExists) return res.status(400).json({ error: 'Categoria não encontrada (categoryId inválido).' });
        data.books[idx].categoryId = categoryId || null;
    }

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

// --- MÓDULO USUÁRIO (CRUD COMPLETO) ---

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
            password, // Em um ambiente real, NUNCA salvaríamos a senha assim (deveria ser hashed).
            createdAt: new Date().toISOString()
        };
        data.users.push(newUser);
        await writeData(data);
        // Retorna o usuário sem a senha por segurança (mesmo sendo um mock)
        const { password: _, ...safeUser } = newUser; 
        return res.status(201).json(safeUser);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// [RF01.2] Consultar Usuário (Todos)
app.get('/users', async (req, res) => {
    const data = await readData();
    // Retorna todos os usuários, removendo a senha de cada um
    const safeUsers = data.users.map(({ password: _, ...user }) => user);
    res.json(safeUsers);
});

// [RF01.2] Consultar Usuário (ID)
app.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    const data = await readData();
    const user = data.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    // Retorna o usuário, removendo a senha
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
             // Verifica se o novo e-mail já pertence a outro usuário
            const emailExists = data.users.some((u, i) => i !== idx && u.email === email.trim());
            if (emailExists) return res.status(400).json({ error: 'E-mail já cadastrado para outro usuário.' });

            data.users[idx].email = email.trim();
        }
        if (password !== undefined) data.users[idx].password = password;
        
        data.users[idx].updatedAt = new Date().toISOString();
        await writeData(data);
        
        // Retorna o usuário, removendo a senha
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
        
        // Regra de Negócio: Usuário não pode ser excluído se tiver dependências (e.g., Pedidos, Avaliações).
        // Por enquanto, verificamos apenas se ele está listado como ID de autor em algum livro (apenas um placeholder)
        const usedInBook = data.books.some(b => b.authorId === id); // Usando authorId para simular uma relação
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

// --- MÓDULO CATEGORIA (CRUD COMPLETO) ---

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

// [RF04.2] Consultar Categoria (Todas)
app.get('/categories', async (req, res) => {
    const data = await readData();
    res.json(data.categories);
});

// [RF04.2] Consultar Categoria (ID)
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
        
        // Regra de Negócio: Categoria não pode ser excluída se estiver associada a um livro.
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

// --- ROTA DE SAÚDE ---
app.get('/health', (req, res) => res.json({ status: 'ok' }));


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BookVerse backend rodando na porta ${PORT}`);
});