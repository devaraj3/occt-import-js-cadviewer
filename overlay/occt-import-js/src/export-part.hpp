#pragma once

#include <emscripten/val.h>

// ExportPart(bytes, { inputExt, partId, format }) -> { success, format, bytes } | { success:false, error }
emscripten::val ExportPartImpl (const emscripten::val& buffer, const emscripten::val& options);
