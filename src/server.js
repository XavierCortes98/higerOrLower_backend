const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "http://localhost:4200",
  })
);
const usedMovieIds = new Set();
const maxUsedMovies = 20;

const TMDB_API_KEY = process.env.TMDB_API_KEY; // Ensure this is set in your .env file
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

//Middleware to check API key
app.use((req, res, next) => {
  if (!TMDB_API_KEY) {
    return res.status(500).json({ error: "TMDB API key no encontrada" });
  }
  next();
});

app.get("/api/random-movie", async (req, res) => {
  try {
    let randomMovie;
    let isUnique = false;
    let retries = 0;
    const maxRetries = 10; // Para evitar bucles infinitos en caso de problemas con la API

    // Bucle para buscar una película que no se haya usado antes
    while (!isUnique && retries < maxRetries) {
      // Obtiene un número de página aleatorio entre 1 y 500
      const randomPage = Math.floor(Math.random() * 500) + 1;

      const response = await axios.get(
        "https://api.themoviedb.org/3/discover/movie",
        {
          params: {
            api_key: TMDB_API_KEY,
            language: "es-ES",
            sort_by: "popularity.desc",
            "vote_count.gte": 400,
            page: randomPage,
          },
        }
      );

      const movies = response.data.results;
      if (movies.length === 0) {
        retries++;
        continue;
      }

      // Elige una película aleatoria de la página
      const randomIndex = Math.floor(Math.random() * movies.length);
      const selectedMovie = movies[randomIndex];

      if (!usedMovieIds.has(selectedMovie.id)) {
        randomMovie = selectedMovie;
        isUnique = true;
      }

      retries++;
    }

    if (!isUnique) {
      console.warn(
        "No se pudo encontrar una película única después de varios intentos. Reiniciando la lista de películas usadas."
      );
      usedMovieIds.clear(); // Limpia el array si no se encuentra una película única
      return res
        .status(404)
        .json({ error: "No se encontraron películas únicas." });
    }

    // Si el array de IDs llega a su límite, lo reinicia
    if (usedMovieIds.size >= maxUsedMovies) {
      usedMovieIds.clear();
    }
    usedMovieIds.add(randomMovie.id);

    const movieDetailsResponse = await axios.get(
      `${TMDB_BASE_URL}/movie/${randomMovie.id}`,
      {
        params: {
          api_key: TMDB_API_KEY,
          language: "es-ES",
        },
      }
    );

    const movieDetails = movieDetailsResponse.data;

    const simplifiedMovie = {
      title: movieDetails.title,
      vote_average: movieDetails.vote_average,
      poster_path: "https://image.tmdb.org/t/p/w500" + movieDetails.poster_path,
      id: movieDetails.id,
    };

    res.json(simplifiedMovie);
  } catch (error) {
    console.error(
      "Error al obtener la película: ",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Error al obtener la película" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
