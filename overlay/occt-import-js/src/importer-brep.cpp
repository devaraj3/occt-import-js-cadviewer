#include "importer-brep.hpp"
#include "importer-utils.hpp"

#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Face.hxx>
#include <BRep_Builder.hxx>
#include <BRepTools.hxx>
#include <TopoDS_Compound.hxx>
#include <cctype>

// All faces that are not part of a shell, gathered in a compound (null if there are none).
static TopoDS_Shape LooseFacesCompound (const TopoDS_Shape& shape)
{
    TopoDS_Compound compound;
    BRep_Builder builder;
    builder.MakeCompound (compound);
    bool any = false;
    for (TopExp_Explorer ex (shape, TopAbs_FACE, TopAbs_SHELL); ex.More (); ex.Next ()) {
        builder.Add (compound, ex.Current ());
        any = true;
    }
    return any ? TopoDS_Shape (compound) : TopoDS_Shape ();
}

class BrepFace : public OcctFace
{
public:
    BrepFace (const TopoDS_Face& face) :
        OcctFace (face)
    {

    }

    virtual TopoDS_Face GetTopoFace () const override
    {
        return face;
    }
};

class BrepShapeMesh : public Mesh
{
public:
    BrepShapeMesh (const TopoDS_Shape& shape, const std::string& partId) :
        Mesh (),
        shape (shape),
        partId (partId)
    {

    }

    virtual std::string GetPartId () const override
    {
        return partId;
    }

    virtual std::string GetName () const override
    {
        return std::string ();
    }

    virtual bool GetColor (Color&) const override
    {
        return false;
    }

    virtual void EnumerateFaces (const std::function<void (const Face&)>& onFace) const override
    {
        for (TopExp_Explorer ex (shape, TopAbs_FACE); ex.More (); ex.Next ()) {
            const TopoDS_Face& face = TopoDS::Face (ex.Current ());
            BrepFace outputFace (face);
            onFace (outputFace);
        }
    }

private:
    const TopoDS_Shape& shape;
    std::string partId;
};

class BrepStandaloneFacesMesh : public Mesh
{
public:
    BrepStandaloneFacesMesh (const TopoDS_Shape& shape, const std::string& partId) :
        Mesh (),
        shape (shape),
        partId (partId)
    {

    }

    virtual std::string GetPartId () const override
    {
        return partId;
    }

    bool HasFaces () const
    {
        TopExp_Explorer ex (shape, TopAbs_FACE, TopAbs_SHELL);
        return ex.More ();
    }

    virtual std::string GetName () const override
    {
        return std::string ();
    }

    virtual bool GetColor (Color&) const override
    {
        return false;
    }

    virtual void EnumerateFaces (const std::function<void (const Face& face)>& onFace) const override
    {
        for (TopExp_Explorer ex (shape, TopAbs_FACE, TopAbs_SHELL); ex.More (); ex.Next ()) {
            const TopoDS_Face& face = TopoDS::Face (ex.Current ());
            BrepFace outputFace (face);
            onFace (outputFace);
        }
    }

private:
    const TopoDS_Shape& shape;
    std::string partId;
};

class BrepNode : public Node
{
public:
    BrepNode (const TopoDS_Shape& shape) :
        shape (shape)
    {

    }

    virtual std::string GetName () const override
    {
        return std::string ();
    }

    virtual std::string GetPartId () const override
    {
        return "brep:root";
    }

    virtual TopoDS_Shape GetTopoShape () const override
    {
        return shape;
    }

    // one unit per mesh, in the order EnumerateMeshes emits them
    virtual std::vector<std::pair<std::string, TopoDS_Shape>> GetTopoUnits () const override
    {
        std::vector<std::pair<std::string, TopoDS_Shape>> units;
        int solidIndex = 0;
        for (TopExp_Explorer ex (shape, TopAbs_SOLID); ex.More (); ex.Next ()) {
            units.push_back ({ "brep:solid:" + std::to_string (solidIndex++), ex.Current () });
        }
        int shellIndex = 0;
        for (TopExp_Explorer ex (shape, TopAbs_SHELL, TopAbs_SOLID); ex.More (); ex.Next ()) {
            units.push_back ({ "brep:shell:" + std::to_string (shellIndex++), ex.Current () });
        }
        TopoDS_Shape faces = LooseFacesCompound (shape);
        if (!faces.IsNull ()) {
            units.push_back ({ "brep:faces:0", faces });
        }
        return units;
    }

    virtual std::vector<NodePtr> GetChildren () const override
    {
        return {};
    }

    virtual bool IsMeshNode () const override
    {
        return true;
    }

    virtual void EnumerateMeshes (const std::function<void (const Mesh&)>& onMesh) const override
    {
        // Enumerate solids
        int solidIndex = 0;
        for (TopExp_Explorer ex (shape, TopAbs_SOLID); ex.More (); ex.Next ()) {
            const TopoDS_Shape& currentShape = ex.Current ();
            BrepShapeMesh outputShapeMesh (currentShape, "brep:solid:" + std::to_string (solidIndex++));
            onMesh (outputShapeMesh);
        }

        // Enumerate shells that are not part of a solid
        int shellIndex = 0;
        for (TopExp_Explorer ex (shape, TopAbs_SHELL, TopAbs_SOLID); ex.More (); ex.Next ()) {
            const TopoDS_Shape& currentShape = ex.Current ();
            BrepShapeMesh outputShapeMesh (currentShape, "brep:shell:" + std::to_string (shellIndex++));
            onMesh (outputShapeMesh);
        }

        // Create a mesh from faces that are not part of a shell
        BrepStandaloneFacesMesh standaloneFacesMesh (shape, "brep:faces:0");
        if (standaloneFacesMesh.HasFaces ()) {
            onMesh (standaloneFacesMesh);
        }
    }

private:
    const TopoDS_Shape& shape;
};

ImporterBrep::ImporterBrep () :
    Importer (),
    shape ()
{

}

Importer::Result ImporterBrep::LoadFile (const std::vector<std::uint8_t>& fileContent, const ImportParams& params)
{
    VectorBuffer inputBuffer (fileContent);
    std::istream inputStream (&inputBuffer);

    BRep_Builder builder;
    BRepTools::Read (shape, inputStream, builder);
    if (shape.IsNull ()) {
        return Importer::Result::ImportFailed;
    }

    TriangulateShape (shape, params);
    return Importer::Result::Success;
}

NodePtr ImporterBrep::GetRootNode () const
{
    return std::make_shared<BrepNode> (shape);
}

// "brep:root" (whole shape), "brep:solid:N", "brep:shell:N" (shells outside solids), "brep:faces:0"
// (faces outside shells), matching the ids BrepNode::EnumerateMeshes emits.
bool ImporterBrep::ResolvePart (const std::string& partId, TopoDS_Shape& result) const
{
    if (shape.IsNull ()) {
        return false;
    }
    if (partId == "brep:root") {
        result = shape;
        return true;
    }

    auto parseIndex = [] (const std::string& text, int& index) {
        if (text.empty () || text.size () > 9) {
            return false;
        }
        for (char c : text) {
            if (!std::isdigit ((unsigned char) c)) {
                return false;
            }
        }
        index = std::stoi (text);
        return true;
    };

    const std::string solidPrefix = "brep:solid:";
    const std::string shellPrefix = "brep:shell:";
    const std::string facesPrefix = "brep:faces:";
    int wanted = 0;
    if (partId.compare (0, solidPrefix.size (), solidPrefix) == 0 && parseIndex (partId.substr (solidPrefix.size ()), wanted)) {
        int index = 0;
        for (TopExp_Explorer ex (shape, TopAbs_SOLID); ex.More (); ex.Next (), index++) {
            if (index == wanted) {
                result = ex.Current ();
                return true;
            }
        }
        return false;
    }
    if (partId.compare (0, shellPrefix.size (), shellPrefix) == 0 && parseIndex (partId.substr (shellPrefix.size ()), wanted)) {
        int index = 0;
        for (TopExp_Explorer ex (shape, TopAbs_SHELL, TopAbs_SOLID); ex.More (); ex.Next (), index++) {
            if (index == wanted) {
                result = ex.Current ();
                return true;
            }
        }
        return false;
    }
    if (partId.compare (0, facesPrefix.size (), facesPrefix) == 0 && parseIndex (partId.substr (facesPrefix.size ()), wanted) && wanted == 0) {
        TopoDS_Shape faces = LooseFacesCompound (shape);
        if (faces.IsNull ()) {
            return false;
        }
        result = faces;
        return true;
    }
    return false;
}
