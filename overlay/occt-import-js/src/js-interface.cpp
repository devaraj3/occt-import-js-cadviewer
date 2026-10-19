#ifdef EMSCRIPTEN

#include "js-interface.hpp"
#include "importer-step.hpp"
#include "importer-iges.hpp"
#include "importer-brep.hpp"
#include "topology.hpp"
#include "export-part.hpp"
#include <emscripten/bind.h>
#include <algorithm>
#include <cctype>

class HierarchyWriter
{
public:
    HierarchyWriter (emscripten::val& meshesArr, std::vector<NodeRecord>* records = nullptr) :
        mMeshesArr (meshesArr),
        mMeshCount (0),
        mFaceCount (0),
        mRecords (records)
    {
    }

    void WriteNode (const NodePtr& node, emscripten::val& nodeObj)
    {
        nodeObj.set ("name", node->GetName ());
        std::string nodePartId = node->GetPartId ();
        if (!nodePartId.empty ()) {
            nodeObj.set ("partId", nodePartId);
        }

        emscripten::val nodeMeshesArr (emscripten::val::array ());
        WriteMeshes (node, nodeMeshesArr);
        nodeObj.set ("meshes", nodeMeshesArr);

        std::vector<NodePtr> children = node->GetChildren ();
        emscripten::val childrenArr (emscripten::val::array ());
        for (int childIndex = 0; childIndex < children.size (); childIndex++) {
            const NodePtr& child = children[childIndex];
            emscripten::val childNodeObj (emscripten::val::object ());
            WriteNode (child, childNodeObj);
            childrenArr.set (childIndex, childNodeObj);
        }
        nodeObj.set ("children", childrenArr);
    }

private:
    // Face numbering of one topology unit: topology.faces ids are "f_<base + i - 1>" for map index i.
    struct UnitFaces
    {
        TopTools_IndexedMapOfShape faceMap;
        int base;
    };

    void WriteMeshes (const NodePtr& node, emscripten::val& nodeMeshesArr)
    {
        if (!node->IsMeshNode ()) {
            return;
        }

        // The unit shapes and their face ids are fixed before any mesh is written, in the same order
        // BuildTopology numbers them (units of nodes that produce meshes, node order, global counter).
        std::vector<NodeRecord> nodeRecords;
        std::vector<UnitFaces> units;
        if (mRecords != nullptr) {
            bool hasMeshes = false;
            node->EnumerateMeshes ([&](const Mesh&) { hasMeshes = true; });
            if (hasMeshes) {
                for (const auto& unit : node->GetTopoUnits ()) {
                    NodeRecord record;
                    record.partId = unit.first;
                    record.shape = unit.second;
                    nodeRecords.push_back (record);
                    units.emplace_back ();
                    units.back ().base = mFaceCount;
                    MapUnitFaces (record.shape, units.back ().faceMap);
                    mFaceCount += units.back ().faceMap.Extent ();
                }
            }
        }

        int nodeMeshCount = 0;
        node->EnumerateMeshes ([&](const Mesh& mesh) {
            emscripten::val meshObj (emscripten::val::object ());
            meshObj.set ("name", mesh.GetName ());
            std::string meshPartId = mesh.GetPartId ();
            if (!meshPartId.empty ()) {
                meshObj.set ("partId", meshPartId);
            }

            int vertexCount = 0;
            int normalCount = 0;
            int triangleCount = 0;
            int brepFaceCount = 0;

            emscripten::val positionArr (emscripten::val::array ());
            emscripten::val normalArr (emscripten::val::array ());
            emscripten::val indexArr (emscripten::val::array ());
            emscripten::val brepFaceArr (emscripten::val::array ());

            // a single unit (XCAF node) serves all of the node's meshes; otherwise one unit per mesh
            const UnitFaces* meshUnit = nullptr;
            if (units.size () == 1) {
                meshUnit = &units[0];
            } else if (nodeMeshCount < (int) units.size ()) {
                meshUnit = &units[nodeMeshCount];
            }

            mesh.EnumerateFaces ([&](const Face& face) {
                int triangleOffset = triangleCount;
                int vertexOffset = vertexCount;
                face.EnumerateVertices ([&](double x, double y, double z) {
                    positionArr.set (vertexCount * 3, x);
                    positionArr.set (vertexCount * 3 + 1, y);
                    positionArr.set (vertexCount * 3 + 2, z);
                    vertexCount += 1;
                });
                face.EnumerateNormals ([&](double x, double y, double z) {
                    normalArr.set (normalCount * 3, x);
                    normalArr.set (normalCount * 3 + 1, y);
                    normalArr.set (normalCount * 3 + 2, z);
                    normalCount += 1;
                });
                face.EnumerateTriangles ([&](int v0, int v1, int v2) {
                    indexArr.set (triangleCount * 3, vertexOffset + v0);
                    indexArr.set (triangleCount * 3 + 1, vertexOffset + v1);
                    indexArr.set (triangleCount * 3 + 2, vertexOffset + v2);
                    triangleCount += 1;
                });
                emscripten::val brepFaceObj (emscripten::val::object ());
                brepFaceObj.set ("first", triangleOffset);
                brepFaceObj.set ("last", triangleCount - 1);
                Color faceColor;
                if (face.GetColor (faceColor)) {
                    emscripten::val colorArr (emscripten::val::array ());
                    colorArr.set (0, faceColor.r);
                    colorArr.set (1, faceColor.g);
                    colorArr.set (2, faceColor.b);
                    brepFaceObj.set ("color", colorArr);
                } else {
                    brepFaceObj.set ("color", emscripten::val::null ());
                }
                if (meshUnit != nullptr) {
                    int faceIndex = meshUnit->faceMap.FindIndex (face.GetTopoFace ());
                    if (faceIndex > 0) {
                        brepFaceObj.set ("faceId", "f_" + std::to_string (meshUnit->base + faceIndex - 1));
                    }
                }
                brepFaceArr.set (brepFaceCount, brepFaceObj);
                brepFaceCount += 1;
            });

            emscripten::val attributesObj (emscripten::val::object ());

            emscripten::val positionObj (emscripten::val::object ());
            positionObj.set ("array", positionArr);
            attributesObj.set ("position", positionObj);

            if (vertexCount == normalCount) {
                emscripten::val normalObj (emscripten::val::object ());
                normalObj.set ("array", normalArr);
                attributesObj.set ("normal", normalObj);
            }

            emscripten::val indexObj (emscripten::val::object ());
            indexObj.set ("array", indexArr);

            meshObj.set ("attributes", attributesObj);
            meshObj.set ("index", indexObj);

            Color meshColor;
            if (mesh.GetColor (meshColor)) {
                emscripten::val colorArr (emscripten::val::array ());
                colorArr.set (0, meshColor.r);
                colorArr.set (1, meshColor.g);
                colorArr.set (2, meshColor.b);
                meshObj.set ("color", colorArr);
            }

            meshObj.set ("brep_faces", brepFaceArr);

            mMeshesArr.set (mMeshCount, meshObj);
            nodeMeshesArr.set (nodeMeshCount, mMeshCount);
            mMeshCount += 1;
            nodeMeshCount += 1;
        });

        // exact topology is extracted once per node that produced meshes
        if (mRecords != nullptr && nodeMeshCount > 0) {
            mRecords->insert (mRecords->end (), nodeRecords.begin (), nodeRecords.end ());
        }
    }

    emscripten::val& mMeshesArr;
    int mMeshCount;
    int mFaceCount;
    std::vector<NodeRecord>* mRecords;
};

static void EnumerateNodeMeshes (const NodePtr& node, const std::function<void (const Mesh&)>& onMesh)
{
    if (node->IsMeshNode ()) {
        node->EnumerateMeshes (onMesh);
    }
    std::vector<NodePtr> children = node->GetChildren ();
    for (const NodePtr& child : children) {
        EnumerateNodeMeshes (child, onMesh);
    }
}

static emscripten::val ImportFile (ImporterPtr importer, const emscripten::val& buffer, const ImportParams& params)
{
    emscripten::val resultObj (emscripten::val::object ());

    const std::vector<uint8_t>& bufferArr = emscripten::vecFromJSArray<std::uint8_t> (buffer);
    Importer::Result importResult = importer->LoadFile (bufferArr, params);
    resultObj.set ("success", importResult == Importer::Result::Success);
    if (importResult != Importer::Result::Success) {
        return resultObj;
    }

    int meshIndex = 0;
    emscripten::val rootNodeObj (emscripten::val::object ());
    emscripten::val meshesArr (emscripten::val::array ());
    NodePtr rootNode = importer->GetRootNode ();

    HierarchyWriter hierarchyWriter (meshesArr);
    hierarchyWriter.WriteNode (rootNode, rootNodeObj);

    resultObj.set ("root", rootNodeObj);
    resultObj.set ("meshes", meshesArr);
    return resultObj;
}

static ImportParams GetImportParams (const emscripten::val& paramsVal)
{
    ImportParams params;
    if (paramsVal.isUndefined () || paramsVal.isNull ()) {
        return params;
    }

    if (paramsVal.hasOwnProperty ("linearUnit")) {
        emscripten::val linearUnit = paramsVal["linearUnit"];
        std::string linearUnitStr = linearUnit.as<std::string> ();
        if (linearUnitStr == "millimeter") {
            params.linearUnit = ImportParams::LinearUnit::Millimeter;
        } else if (linearUnitStr == "centimeter") {
            params.linearUnit = ImportParams::LinearUnit::Centimeter;
        } else if (linearUnitStr == "meter") {
            params.linearUnit = ImportParams::LinearUnit::Meter;
        } else if (linearUnitStr == "inch") {
            params.linearUnit = ImportParams::LinearUnit::Inch;
        } else if (linearUnitStr == "foot") {
            params.linearUnit = ImportParams::LinearUnit::Foot;
        }
    }

    if (paramsVal.hasOwnProperty ("linearDeflectionType")) {
        emscripten::val linearDeflectionType = paramsVal["linearDeflectionType"];
        std::string linearDeflectionTypeStr = linearDeflectionType.as<std::string> ();
        if (linearDeflectionTypeStr == "bounding_box_ratio") {
            params.linearDeflectionType = ImportParams::LinearDeflectionType::BoundingBoxRatio;
        } else if (linearDeflectionTypeStr == "absolute_value") {
            params.linearDeflectionType = ImportParams::LinearDeflectionType::AbsoluteValue;
        }
    }

    if (paramsVal.hasOwnProperty ("linearDeflection")) {
        emscripten::val linearDeflection = paramsVal["linearDeflection"];
        params.linearDeflection = linearDeflection.as<double> ();
    }

    if (paramsVal.hasOwnProperty ("angularDeflection")) {
        emscripten::val angularDeflection = paramsVal["angularDeflection"];
        params.angularDeflection = angularDeflection.as<double> ();
    }

    return params;
}

emscripten::val ReadStepFile (const emscripten::val& buffer, const emscripten::val& params)
{
    ImporterPtr importer = std::make_shared<ImporterStep> ();
    ImportParams importParams = GetImportParams (params);
    return ImportFile (importer, buffer, importParams);
}

emscripten::val ReadIgesFile (const emscripten::val& buffer, const emscripten::val& params)
{
    ImporterPtr importer = std::make_shared<ImporterIges> ();
    ImportParams importParams = GetImportParams (params);
    return ImportFile (importer, buffer, importParams);
}

emscripten::val ReadBrepFile (const emscripten::val& buffer, const emscripten::val& params)
{
    ImporterPtr importer = std::make_shared<ImporterBrep> ();
    ImportParams importParams = GetImportParams (params);
    return ImportFile (importer, buffer, importParams);
}

emscripten::val ReadFile (const std::string& format, const emscripten::val& buffer, const emscripten::val& params)
{
    if (format == "step") {
        return ReadStepFile (buffer, params);
    } else if (format == "iges") {
        return ReadIgesFile (buffer, params);
    } else if (format == "brep") {
        return ReadBrepFile (buffer, params);
    } else {
        emscripten::val resultObj (emscripten::val::object ());
        resultObj.set ("success", false);
        return resultObj;
    }
}

// ---- CAD Viewer additions -------------------------------------------------

// Returns "step" / "iges" / "brep" for a supported (case-insensitive) extension, "" otherwise.
std::string CanonicalSourceExt (const std::string& ext)
{
    std::string lower (ext);
    std::transform (lower.begin (), lower.end (), lower.begin (), [] (unsigned char c) { return (char) std::tolower (c); });
    if (lower == "step" || lower == "stp") {
        return "step";
    }
    if (lower == "iges" || lower == "igs") {
        return "iges";
    }
    if (lower == "brep") {
        return "brep";
    }
    return std::string ();
}

ImporterPtr CreateImporterForExt (const std::string& canonicalExt)
{
    if (canonicalExt == "step") {
        return std::make_shared<ImporterStep> ();
    }
    if (canonicalExt == "iges") {
        return std::make_shared<ImporterIges> ();
    }
    return std::make_shared<ImporterBrep> ();
}

static emscripten::val ErrorResult (const char* message)
{
    emscripten::val resultObj (emscripten::val::object ());
    resultObj.set ("success", false);
    resultObj.set ("error", std::string (message));
    return resultObj;
}

static bool IsObjectValue (const emscripten::val& v)
{
    return !v.isUndefined () && !v.isNull () && v.typeOf ().as<std::string> () == "object";
}

static bool IsMissing (const emscripten::val& v)
{
    return v.isUndefined () || v.isNull ();
}

emscripten::val TessellateWithTopology (const emscripten::val& buffer, const emscripten::val& options)
{
    if (!IsObjectValue (options)) {
        return ErrorResult ("Missing required topology options: ext or inputExt");
    }

    emscripten::val extVal = options["ext"];
    if (IsMissing (extVal)) {
        extVal = options["inputExt"];
    }
    if (IsMissing (extVal)) {
        return ErrorResult ("Missing required topology options: ext or inputExt");
    }
    std::string ext = CanonicalSourceExt (extVal.as<std::string> ());
    if (ext.empty ()) {
        return ErrorResult ("Unsupported source extension");
    }

    // Mesh parameters use the stock parser (linearUnit, linearDeflectionType, linearDeflection,
    // angularDeflection). A `mesh` key, when present, replaces the top-level options entirely.
    emscripten::val paramSource = options;
    if (options.hasOwnProperty ("mesh")) {
        paramSource = options["mesh"];
    }
    ImportParams params = GetImportParams (paramSource);

    ImporterPtr importer = CreateImporterForExt (ext);
    const std::vector<std::uint8_t>& bufferArr = emscripten::vecFromJSArray<std::uint8_t> (buffer);
    if (importer->LoadFile (bufferArr, params) != Importer::Result::Success) {
        return ErrorResult ("Failed to load source CAD file");
    }

    emscripten::val resultObj (emscripten::val::object ());
    resultObj.set ("success", true);

    emscripten::val rootNodeObj (emscripten::val::object ());
    emscripten::val meshesArr (emscripten::val::array ());
    std::vector<NodeRecord> records;
    HierarchyWriter hierarchyWriter (meshesArr, &records);
    hierarchyWriter.WriteNode (importer->GetRootNode (), rootNodeObj);
    resultObj.set ("root", rootNodeObj);
    resultObj.set ("meshes", meshesArr);
    resultObj.set ("topology", BuildTopology (records));
    return resultObj;
}

emscripten::val ExportPart (const emscripten::val& buffer, const emscripten::val& options)
{
    return ExportPartImpl (buffer, options);
}

EMSCRIPTEN_BINDINGS (occtimportjs)
{
    emscripten::function<emscripten::val, const std::string&, const emscripten::val&, const emscripten::val&> ("ReadFile", &ReadFile);

    emscripten::function<emscripten::val, const emscripten::val&, const emscripten::val&> ("ReadStepFile", &ReadStepFile);
    emscripten::function<emscripten::val, const emscripten::val&, const emscripten::val&> ("ReadIgesFile", &ReadIgesFile);
    emscripten::function<emscripten::val, const emscripten::val&, const emscripten::val&> ("ReadBrepFile", &ReadBrepFile);

    emscripten::function<emscripten::val, const emscripten::val&, const emscripten::val&> ("ExportPart", &ExportPart);
    emscripten::function<emscripten::val, const emscripten::val&, const emscripten::val&> ("TessellateWithTopology", &TessellateWithTopology);
}

#endif
