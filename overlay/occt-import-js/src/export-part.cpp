#ifdef EMSCRIPTEN

#include "export-part.hpp"
#include "importer.hpp"
#include "importer-step.hpp"
#include "importer-iges.hpp"
#include "importer-brep.hpp"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include <BRepTools.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <IGESControl_Controller.hxx>
#include <IGESControl_Writer.hxx>
#include <IGESCAFControl_Writer.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <STEPControl_StepModelType.hxx>
#include <STEPControl_Writer.hxx>
#include <TDocStd_Document.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <TopoDS_Shape.hxx>
#include <emscripten/bind.h>

using emscripten::val;

std::string CanonicalSourceExt (const std::string& ext);
ImporterPtr CreateImporterForExt (const std::string& canonicalExt);

namespace
{

val Fail (const char* message)
{
    val r (val::object ());
    r.set ("success", false);
    r.set ("error", std::string (message));
    return r;
}

bool Missing (const val& v)
{
    return v.isUndefined () || v.isNull ();
}

std::string Lower (std::string s)
{
    std::transform (s.begin (), s.end (), s.begin (), [] (unsigned char c) { return (char) std::tolower (c); });
    return s;
}

// Writes the shape through a temporary file in the in-memory filesystem.
bool WriteShape (const TopoDS_Shape& shape, const std::string& format, bool fromXcaf, std::vector<char>& bytes)
{
    std::string kind;
    if (format == "step" || format == "stp") {
        kind = "step";
    } else if (format == "iges" || format == "igs") {
        kind = "iges";
    } else if (format == "brep") {
        kind = "brep";
    } else {
        return false;
    }

    // Same temp file naming as the reference runtime: a per-process counter, advanced on every
    // export with a valid format (the name shows up in OCCT's console statistics).
    static int exportCounter = 0;
    exportCounter++;
    const std::string path = "temp_part_export_" + std::to_string (exportCounter) + "." + kind;
    bool written = false;
    if (kind == "brep") {
        std::ofstream out (path, std::ios::binary);
        BRepTools::Write (shape, out);
        out.close ();
        written = !out.fail ();
    } else if (!fromXcaf) {
        // BREP sources have no XCAF document: the plain writers are used (default product name)
        if (kind == "step") {
            STEPControl_Writer writer;
            written = writer.Transfer (shape, STEPControl_AsIs) == IFSelect_RetDone &&
                      writer.Write (path.c_str ()) == IFSelect_RetDone;
        } else {
            IGESControl_Controller::Init ();
            IGESControl_Writer writer;
            written = writer.AddShape (shape);
            if (written) {
                writer.ComputeModel ();
                written = writer.Write (path.c_str ());
            }
        }
    } else {
        // STEP/IGES sources: a fresh XCAF document holding just this shape
        Handle (TDocStd_Document) document = new TDocStd_Document ("XmlXCAF");
        Handle (XCAFDoc_ShapeTool) shapeTool = XCAFDoc_DocumentTool::ShapeTool (document->Main ());
        shapeTool->AddShape (shape, Standard_False);
        if (kind == "step") {
            STEPCAFControl_Writer writer;
            written = writer.Transfer (document, STEPControl_AsIs) && writer.Write (path.c_str ()) == IFSelect_RetDone;
        } else {
            IGESCAFControl_Writer writer;
            written = writer.Transfer (document) && writer.Write (path.c_str ());
        }
    }

    if (written) {
        std::ifstream in (path, std::ios::binary);
        if (in.is_open ()) {
            bytes.assign (std::istreambuf_iterator<char> (in), std::istreambuf_iterator<char> ());
        } else {
            written = false;
        }
    }
    std::remove (path.c_str ());
    return written && !bytes.empty ();
}

} // namespace

val ExportPartImpl (const val& buffer, const val& options)
{
    if (Missing (options) || options.typeOf ().as<std::string> () != "object") {
        return Fail ("Missing required export options");
    }
    val extVal = options["inputExt"];
    val partVal = options["partId"];
    val formatVal = options["format"];
    if (Missing (extVal) || Missing (partVal) || Missing (formatVal)) {
        return Fail ("Missing required export options");
    }

    const std::string extRaw = extVal.as<std::string> ();
    const std::string partId = partVal.as<std::string> ();
    const std::string format = Lower (formatVal.as<std::string> ());

    const std::string ext = CanonicalSourceExt (extRaw);
    if (ext.empty ()) {
        return Fail ("Unsupported source extension");
    }

    ImporterPtr importer = CreateImporterForExt (ext);
    const std::vector<std::uint8_t>& bufferArr = emscripten::vecFromJSArray<std::uint8_t> (buffer);
    if (importer->LoadFile (bufferArr, ImportParams ()) != Importer::Result::Success) {
        return Fail ("Failed to load source CAD file");
    }

    TopoDS_Shape shape;
    if (!importer->ResolvePart (partId, shape)) {
        return Fail ("Failed to resolve CAD part by partId");
    }

    std::vector<char> bytes;
    if (!WriteShape (shape, format, ext != "brep", bytes)) {
        return Fail ("Failed to export exact CAD shape");
    }

    val out (val::object ());
    out.set ("success", true);
    out.set ("format", format);
    out.set ("bytes", val::global ("Uint8Array").new_ (emscripten::typed_memory_view (bytes.size (), (const unsigned char*) bytes.data ())));
    return out;
}

#endif
