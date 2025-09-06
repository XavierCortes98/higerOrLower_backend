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
    const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        language: "es-ES",
        sort_by: "popularity.desc",
        "vote_count.gte": 500,
      },
    });
    const movies = response.data.results;

    if (movies.length === 0) {
      return res.status(404).json({ error: "No se han encontrado películas" });
    }

    const randomIndex = Math.floor(Math.random() * movies.length);
    const randomMovie = movies[randomIndex];

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
      poster_path: movieDetails.poster_path,
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
