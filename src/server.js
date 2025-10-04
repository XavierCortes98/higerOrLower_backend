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
const USED_MOVIES_IDS = new Set();
const SORT_UNIQUE_MOVIES_IDS = new Set();
const FAILED_IDS_STUBS = new Set();

const MAX_USED_MOVIES = 20;

const TMDB_API_KEY = process.env.TMDB_API_KEY; // Ensure this is set in your .env file
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const MAX_SORT_USED_MOVIES = 100;
const SORT_MAX_MOVIES = 5;

//Middleware to check API key
app.use((req, res, next) => {
  if (!TMDB_API_KEY) {
    return res.status(500).json({ error: "TMDB API key no encontrada" });
  }
  next();
});

app.get("/api/random-movie", async (req, res) => {
  try {
    const randomMovie = await findUniqueRandomMovie(USED_MOVIES_IDS);

    if (!randomMovie) {
      console.warn(
        "No se pudo encontrar una película única después de varios intentos. Reiniciando la lista de películas usadas."
      );
      USED_MOVIES_IDS.clear(); // Limpia el array si no se encuentra una película única
      return res
        .status(404)
        .json({ error: "No se encontraron películas únicas." });
    }

    // Si el array de IDs llega a su límite, lo reinicia
    if (USED_MOVIES_IDS.size >= MAX_USED_MOVIES) {
      USED_MOVIES_IDS.clear();
    }
    USED_MOVIES_IDS.add(randomMovie.id);

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

app.get("/api/sort-movies", async (req, res) => {
  let randomMovies = [];
  const maxMoviesToFetch = SORT_MAX_MOVIES;

  try {
    while (randomMovies.length < maxMoviesToFetch) {
      const randomMovie = await findUniqueRandomMovie(SORT_UNIQUE_MOVIES_IDS);

      if (!randomMovie) {
        if (randomMovies.length > 0) break;

        console.warn(
          "No se pudo encontrar una película única para completar el listado. Reiniciando lista."
        );
        SORT_UNIQUE_MOVIES_IDS.clear();
        return res
          .status(404)
          .json({ error: "No se encontraron películas únicas." });
      }

      if (SORT_UNIQUE_MOVIES_IDS.size >= MAX_SORT_USED_MOVIES) {
        SORT_UNIQUE_MOVIES_IDS.clear();
      }
      SORT_UNIQUE_MOVIES_IDS.add(randomMovie.id);
      randomMovies.push(randomMovie);
    }

    if (randomMovies.length === 0) {
      return res
        .status(404)
        .json({ error: "No se pudo obtener ninguna película válida." });
    }

    const detailPromises = randomMovies.map((movie) =>
      axios.get(`${TMDB_BASE_URL}/movie/${movie.id}`, {
        params: {
          api_key: TMDB_API_KEY,
          language: "es-ES",
        },
      })
    );

    const responses = await Promise.allSettled(detailPromises);

    const successfulResponses = responses.filter(
      (result) => result.status === "fulfilled" // [5, 6]
    );

    if (successfulResponses.length === 0) {
      return res
        .status(404)
        .json({ error: "Ninguna película pudo obtener detalles válidos." });
    }

    const moviesDetails = successfulResponses.map((response) =>
      // 'value' contiene la respuesta de Axios completa y exitosa
      simplifyMovieData(response.value.data)
    );

    res.json(moviesDetails);
  } catch (error) {
    // Este catch ahora es más probable que capture el error de "Invalid id"
    // si el filtro inicial falló.
    console.error(
      "Error al obtener la lista de peliculas: ",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({
      error: "Error al obtener la lista de películas (Error TMDB/Servidor)",
    });
  }
});

function simplifyMovieData(movie) {
  return {
    title: movie.title,
    vote_average: movie.vote_average.toFixed(2),
    poster_path: "https://image.tmdb.org/t/p/w500" + movie.poster_path,
    id: movie.id,
  };
}

async function findUniqueRandomMovie(usedMovies) {
  const maxRetries = 10;
  let retries = 0;

  while (retries < maxRetries) {
    const randomPage = Math.floor(Math.random() * 500) + 1;

    try {
      const response = await axios.get(
        "https://api.themoviedb.org/3/discover/movie",
        {
          params: {
            api_key: TMDB_API_KEY,
            language: "es-ES",
            sort_by: "popularity.desc",
            "vote_count.gte": 400,
            "with_runtime.gte": 60,
            page: randomPage,
          },
        }
      );

      const movies = response.data.results;

      const availableMovies = movies.filter(
        (movie) =>
          movie.poster_path &&
          !usedMovies.has(movie.id) &&
          !FAILED_IDS_STUBS.has(movie.id)
      );

      if (availableMovies.length === 0) {
        retries++;
        continue;
      }

      const randomIndex = Math.floor(Math.random() * availableMovies.length);
      const selectedMovie = availableMovies[randomIndex];

      try {
        await axios.get(`${TMDB_BASE_URL}/movie/${selectedMovie.id}`, {
          params: {
            api_key: TMDB_API_KEY,
            language: "es-ES",
          },
        });
        return selectedMovie;
      } catch (validationError) {
        if (
          validationError.response &&
          validationError.response.status === 404
        ) {
          // [1]
          console.warn(
            `ID inválida detectada y puesta en lista negra: ${selectedMovie.id}`
          );
          FAILED_IDS_STUBS.add(selectedMovie.id);
          retries++;
          continue;
        } else {
          throw validationError;
        }
      }

      return selectedMovie;
    } catch (error) {
      console.error(
        "Error en el intento de búsqueda de película:",
        error.message
      );
      retries++;
    }
  }
  return null;
}

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
